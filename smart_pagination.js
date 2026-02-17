const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log("Starting Smart Pagination...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Load the generated HTML
    const filePath = path.join(__dirname, 'generated_view.html');
    if (!fs.existsSync(filePath)) {
        console.error("Error: generated_view.html not found. Run generate_pdf.js first.");
        process.exit(1);
    }

    // Read file and set content
    // Use waitUntil: 'networkidle0' to ensure fonts load, critical for height calc
    const content = fs.readFileSync(filePath, 'utf8');
    await page.setContent(content, { waitUntil: 'networkidle0' });

    // Set Viewport to A4 size (96 DPI)
    await page.setViewport({ width: 794, height: 1123 });

    // 2. Inject Pagination Logic
    await page.evaluate(async () => {
        // A4 Height @ 96 DPI = 1122.5px
        // We set a threshold slightly HIGHER than the minimum height to avoid false positives on empty pages.
        // CSS has min-height: 297mm.
        const A4_HEIGHT_PX = 1123;
        const THRESHOLD_PX = 1130; // Only split if page grows significantly beyond A4
        const CONTENT_LIMIT_PX = 960; // Safe limit ~960px (leaving ~160px for footer)

        console.log(`Pagination Config: Threshold=${THRESHOLD_PX}px, ContentLimit=${CONTENT_LIMIT_PX}px`);

        // Helper: Create a new page structure
        function createNewPage(originalPage, index) {
            const newPage = originalPage.cloneNode(true);
            newPage.setAttribute('data-created-page', 'true'); // unique marker

            // 1. Hide Header on new pages (as requested)
            const header = newPage.querySelector('.page-content > div[style*="border-bottom"]');
            if (header) header.style.display = 'none';

            // Also hide the Intro "Document 01/Header" if it exists (generic pages)
            const introHeader = newPage.querySelector('.page-content > .text-center');
            if (introHeader) introHeader.style.display = 'none';

            // 2. Clear content columns
            const leftCol = newPage.querySelector('.left-column');
            const rightCol = newPage.querySelector('.right-column');
            if (leftCol) leftCol.innerHTML = '';
            // else console.warn("Warning: .left-column not found in cloned page");

            if (rightCol) rightCol.innerHTML = '';

            // 3. Clear Generic Content (fallback, e.g. Intro Page)
            if (!leftCol && !rightCol) {
                // Find content wrapper (div with flex column)
                // Use a broader check: Look for the div that hosts the text content
                const contentDivs = Array.from(newPage.querySelectorAll('.page-content > div'));
                let cleared = false;

                for (const div of contentDivs) {
                    // Check style text safely
                    if (div.style.cssText && div.style.cssText.includes('flex-direction: column')) {
                        // This is likely the container
                        const kids = Array.from(div.children);
                        kids.forEach(k => {
                            // Keep footer (margin-top: auto)
                            if (k.style.marginTop === 'auto') return;
                            k.remove();
                        });
                        cleared = true;
                    }
                }
            }

            // Update Page Number
            const pageFooter = newPage.querySelector('.page-footer .font-retro');
            if (pageFooter) {
                // pageFooter.innerText += "+"; 
            }

            // Insert after original
            originalPage.parentNode.insertBefore(newPage, originalPage.nextSibling);
            return newPage;
        }

        // Helper: Binary search to split text node
        function splitTextNode(textNode, limitY) {
            const fullText = textNode.textContent;
            let start = 0;
            let end = fullText.length;

            if (end === 0) return null;

            // Range checks
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.setEnd(textNode, end);
            const initialRect = range.getBoundingClientRect();

            // If it fits completely, return null (no split needed)
            if (initialRect.bottom <= limitY) return null;

            // If the START is already past the limit, return 0 (move everything)
            // But checking 'top' isn't fully accurate if line-height involved.
            // If rect.top > limitY, entire node is below.
            if (initialRect.top > limitY) return 0;

            let splitIndex = 0;

            while (start <= end) {
                const mid = Math.floor((start + end) / 2);
                range.setEnd(textNode, mid);
                const rect = range.getBoundingClientRect();

                if (rect.bottom > limitY) {
                    // Too long, shorten it
                    end = mid - 1;
                } else {
                    // Fits, try to extend
                    splitIndex = mid;
                    start = mid + 1;
                }
            }

            return splitIndex;
        }

        // iterate pages
        let pageIndex = 0;
        let MAX_LOOPS = 50; // Safety brake
        let safetyCounter = 0;

        // We use a query selector inside the loop to catch new pages
        while (safetyCounter < MAX_LOOPS) {
            let pages = document.querySelectorAll('.page-a4');
            if (pageIndex >= pages.length) break;

            let currentPage = pages[pageIndex];

            // Skip Separator/Cover pages (centered) or new pages effectively processed
            if (currentPage.classList.contains('page-centered')) {
                pageIndex++;
                continue;
            }

            const currentHeight = currentPage.scrollHeight;
            const pageRect = currentPage.getBoundingClientRect();

            // Check Overflow
            if (currentHeight > THRESHOLD_PX) {
                console.log(`Processing Overflow on Page ${pageIndex + 1} (Height: ${currentHeight}px)`);

                // Identify Content Container
                let contentContainer = currentPage.querySelector('.left-column');
                let isGeneric = false;

                if (!contentContainer) {
                    // Match the logic in createNewPage: find the flex-col div
                    const contentDivs = Array.from(currentPage.querySelectorAll('.page-content > div'));
                    for (const div of contentDivs) {
                        if (div.style.cssText && div.style.cssText.includes('flex-direction: column')) {
                            contentContainer = div;
                            isGeneric = true;
                            break;
                        }
                    }
                }

                if (!contentContainer) {
                    console.warn(`Skipping pagination for Page ${pageIndex + 1}: No content container found.`);
                    pageIndex++;
                    safetyCounter++;
                    continue;
                }

                // Create New Page
                const newPage = createNewPage(currentPage, pageIndex + 1);
                let contentMoved = false;

                // Determine target container in new page
                let newContentContainer = null;
                if (isGeneric) {
                    const contentDivs = Array.from(newPage.querySelectorAll('.page-content > div'));
                    for (const div of contentDivs) {
                        if (div.style.cssText && div.style.cssText.includes('flex-direction: column')) {
                            newContentContainer = div;
                            break;
                        }
                    }
                } else {
                    newContentContainer = newPage.querySelector('.left-column');
                }

                // Process Children
                if (contentContainer) {
                    const children = Array.from(contentContainer.children);

                    for (let child of children) {
                        // Skip Footer in Generic Mode
                        if (isGeneric && child.style.marginTop === 'auto') continue;

                        const childRect = child.getBoundingClientRect();
                        const childBottom = childRect.bottom - pageRect.top;
                        const childTop = childRect.top - pageRect.top;

                        // Safety: Check if element fits NOWHERE (starts top, overflows bottom)
                        const isCriticalOverflow = (childTop < 50 && childBottom > CONTENT_LIMIT_PX);

                        if (childBottom <= CONTENT_LIMIT_PX) continue;

                        console.log(`   Splitting element: ${child.className || child.tagName} (Top: ${childTop}, Bottom: ${childBottom})`);

                        // Case: Starts after limit -> Move entirely
                        if (childTop > CONTENT_LIMIT_PX) {
                            newContentContainer.appendChild(child);
                            contentMoved = true;
                            continue;
                        }

                        const limitY = pageRect.top + CONTENT_LIMIT_PX;
                        let splitDone = false;

                        // A. Text/Analysis
                        // Check for standard analysis-text, generic narrative text (Intro), OR a wrapper containing analysis-text
                        const isAnalysisWrapper = !isGeneric && child.querySelector('.analysis-text');
                        const isTextWrapper = child.classList.contains('analysis-text') ||
                            (isGeneric && child.querySelector('p')) ||
                            isAnalysisWrapper;

                        if (isTextWrapper) {
                            let targetNode = child;
                            if (child.classList.contains('analysis-text')) {
                                targetNode = child; // It IS the P (or div acting as text)
                            } else if (child.querySelector('.analysis-text')) {
                                targetNode = child.querySelector('.analysis-text'); // Inner P
                            } else if (child.querySelector('p')) {
                                targetNode = child.querySelector('p'); // Generic P
                            }

                            if (targetNode.firstChild && targetNode.firstChild.nodeType === 3) {
                                const splitIdx = splitTextNode(targetNode.firstChild, limitY);
                                if (splitIdx !== null && splitIdx > 0) {
                                    const remaining = targetNode.firstChild.textContent.substring(splitIdx);
                                    targetNode.firstChild.textContent = targetNode.firstChild.textContent.substring(0, splitIdx);
                                    if (remaining.trim().length > 0) {
                                        let newNode;
                                        if (child === targetNode) {
                                            newNode = child.cloneNode(false);
                                            newNode.textContent = remaining;
                                        } else {
                                            newNode = child.cloneNode(false); // wrapper
                                            const newInner = targetNode.cloneNode(false);
                                            newInner.textContent = remaining;
                                            newNode.appendChild(newInner);
                                        }
                                        newContentContainer.appendChild(newNode);
                                        splitDone = true;
                                    }
                                }
                            }
                        }
                        // B. Insight
                        else if (child.classList.contains('core-insight-box') || child.classList.contains('insight-box')) {
                            const p = child.querySelector('.core-insight-text') || child.querySelector('p');
                            if (p) {
                                const rect = p.getBoundingClientRect();
                                const visibleHeight = limitY - rect.top;
                                if (visibleHeight < 30) {
                                    newContentContainer.appendChild(child);
                                    splitDone = true;
                                } else {
                                    const splitIdx = splitTextNode(p.firstChild, limitY);
                                    if (splitIdx !== null) {
                                        const remaining = p.firstChild.textContent.substring(splitIdx);
                                        p.firstChild.textContent = p.firstChild.textContent.substring(0, splitIdx);
                                        if (remaining.trim().length > 0) {
                                            const newBox = child.cloneNode(true);
                                            const newP = newBox.querySelector('.core-insight-text') || newBox.querySelector('p');
                                            newP.textContent = remaining;
                                            const label = newBox.querySelector('div[style*="absolute"]');
                                            if (label) label.remove();
                                            newContentContainer.appendChild(newBox);
                                            splitDone = true;
                                        }
                                    }
                                }
                            }
                        }

                        // C. Predictions (Specific to normal pages)
                        else if (child.classList.contains('predictions-container')) {
                            const list = child.querySelector('ul');
                            if (list) {
                                const items = Array.from(list.children);
                                const newContainer = child.cloneNode(true);
                                const newList = newContainer.querySelector('ul');
                                newList.innerHTML = '';
                                let moveRest = false;
                                for (let item of items) {
                                    if (moveRest) {
                                        newList.appendChild(item);
                                        continue;
                                    }
                                    const iRect = item.getBoundingClientRect();
                                    if (iRect.bottom > limitY) {
                                        newList.appendChild(item);
                                        moveRest = true;
                                    }
                                }
                                if (newList.children.length > 0) {
                                    newContentContainer.appendChild(newContainer);
                                    splitDone = true;
                                }
                            }
                        }

                        // D. Fallback Check
                        if (splitDone) {
                            contentMoved = true;
                        } else {
                            if (isCriticalOverflow) {
                                console.error(`   CRITICAL: Element ${child.tagName} fits nowhere. LEAVING on current page to prevent loop.`);
                                // Do NOT move. Let it overflow.
                            } else {
                                newContentContainer.appendChild(child);
                                contentMoved = true;
                            }
                        }
                    }
                }

                // Cleanup empty pages
                if (newContentContainer && newContentContainer.children.length === 0 && !contentMoved) {
                    console.log("   No content moved. Removing empty new page.");
                    newPage.remove();
                }

            } // end overflow check
            pageIndex++;
            safetyCounter++;
        }

        if (safetyCounter >= MAX_LOOPS) console.warn("Hit MAX_LOOPS limit!");

        // 4. Update Page Numbers
        let allPages = document.querySelectorAll('.page-a4');
        console.log(`Updating page numbers for ${allPages.length} total pages.`);
        allPages.forEach((p, idx) => {
            const footerPageNum = p.querySelector('.page-footer .font-retro.text-sm');
            if (footerPageNum) {
                footerPageNum.textContent = `Page ${idx + 1}`;
            }
        });

    });

    // 3. Save Output & PDF
    const finalContent = await page.content();
    fs.writeFileSync('paginated_view.html', finalContent);
    console.log("Pagination complete. Saved to paginated_view.html");

    console.log("Rendering PDF...");
    await page.pdf({
        path: 'paginated_report.pdf',
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    console.log("PDF Saved to paginated_report.pdf");

    await browser.close();
})();
