const fs = require('fs');
const path = require('path');
// Lazy-load puppeteer inside generatePDF to avoid startup failures

const generatePDF = async (reportData, outputPath) => {
    const puppeteer = require('puppeteer');
    console.log("Starting PDF Generation...");
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // 1. Load Template
    const templatePath = path.join(__dirname, '../templates/pdf.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // 2. Inject Data
    const dataInjection = `const reportData = ${JSON.stringify(reportData, null, 4)};`;
    const pattern = /const\s+reportData\s*=\s*\{[\s\S]*?\};/;
    if (pattern.test(htmlContent)) {
        htmlContent = htmlContent.replace(pattern, dataInjection);
    } else {
        console.warn("Could not find 'const reportData' block in template.");
    }

    // Cleanup template specific dev code
    htmlContent = htmlContent.replace(/setTimeout\(generateFullPDF, 2000\);/g, '');
    htmlContent = htmlContent.replace(/<script src=".*html2pdf.*"><\/script>/g, '');

    await page.setViewport({ width: 794, height: 1123 }); // A4 at 96 DPI
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 3. Apply Smart Pagination
    await page.evaluate(paginatedLogic);

    // 4. Update Page Numbers
    await page.evaluate(() => {
        const allPages = document.querySelectorAll('.page-a4');
        allPages.forEach((p, idx) => {
            const footerPageNum = p.querySelector('.page-footer .font-retro.text-sm');
            if (footerPageNum) {
                footerPageNum.textContent = `Page ${idx + 1}`;
            }
        });
    });

    // 5. Generate PDF
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();
    console.log(`PDF Generated at: ${outputPath}`);
    return outputPath;
};

// The pagination logic from smart_pagination.js
const paginatedLogic = async () => {
    // A4 Height @ 96 DPI = 1122.5px
    const A4_HEIGHT_PX = 1123;
    const THRESHOLD_PX = 1130;
    const CONTENT_LIMIT_PX = 960;

    console.log(`Pagination Config: Threshold=${THRESHOLD_PX}px, ContentLimit=${CONTENT_LIMIT_PX}px`);

    function createNewPage(originalPage, index) {
        const newPage = originalPage.cloneNode(true);
        newPage.setAttribute('data-created-page', 'true');

        const header = newPage.querySelector('.page-content > div[style*="border-bottom"]');
        if (header) header.style.display = 'none';

        const introHeader = newPage.querySelector('.page-content > .text-center');
        if (introHeader) introHeader.style.display = 'none';

        const leftCol = newPage.querySelector('.left-column');
        const rightCol = newPage.querySelector('.right-column');
        if (leftCol) leftCol.innerHTML = '';
        if (rightCol) rightCol.innerHTML = '';

        if (!leftCol && !rightCol) {
            const contentDivs = Array.from(newPage.querySelectorAll('.page-content > div'));
            for (const div of contentDivs) {
                if (div.style.cssText && div.style.cssText.includes('flex-direction: column')) {
                    const kids = Array.from(div.children);
                    kids.forEach(k => {
                        if (k.style.marginTop === 'auto') return;
                        k.remove();
                    });
                }
            }
        }

        originalPage.parentNode.insertBefore(newPage, originalPage.nextSibling);
        return newPage;
    }

    function splitTextNode(textNode, limitY) {
        const fullText = textNode.textContent;
        let start = 0;
        let end = fullText.length;

        if (end === 0) return null;

        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, end);
        const initialRect = range.getBoundingClientRect();

        if (initialRect.bottom <= limitY) return null;
        if (initialRect.top > limitY) return 0;

        let splitIndex = 0;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            range.setEnd(textNode, mid);
            const rect = range.getBoundingClientRect();

            if (rect.bottom > limitY) {
                end = mid - 1;
            } else {
                splitIndex = mid;
                start = mid + 1;
            }
        }

        return splitIndex;
    }

    let pageIndex = 0;
    let MAX_LOOPS = 50;
    let safetyCounter = 0;

    while (safetyCounter < MAX_LOOPS) {
        let pages = document.querySelectorAll('.page-a4');
        if (pageIndex >= pages.length) break;

        let currentPage = pages[pageIndex];

        if (currentPage.classList.contains('page-centered')) {
            pageIndex++;
            continue;
        }

        const currentHeight = currentPage.scrollHeight;
        const pageRect = currentPage.getBoundingClientRect();

        if (currentHeight > THRESHOLD_PX) {
            let contentContainer = currentPage.querySelector('.left-column');
            let isGeneric = false;

            if (!contentContainer) {
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
                pageIndex++;
                safetyCounter++;
                continue;
            }

            const newPage = createNewPage(currentPage, pageIndex + 1);
            let contentMoved = false;

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

            if (contentContainer) {
                const children = Array.from(contentContainer.children);

                for (let child of children) {
                    if (isGeneric && child.style.marginTop === 'auto') continue;

                    const childRect = child.getBoundingClientRect();
                    const childBottom = childRect.bottom - pageRect.top;
                    const childTop = childRect.top - pageRect.top;
                    const isCriticalOverflow = (childTop < 50 && childBottom > CONTENT_LIMIT_PX);

                    if (childBottom <= CONTENT_LIMIT_PX) continue;

                    if (childTop > CONTENT_LIMIT_PX) {
                        newContentContainer.appendChild(child);
                        contentMoved = true;
                        continue;
                    }

                    const limitY = pageRect.top + CONTENT_LIMIT_PX;
                    let splitDone = false;

                    const isAnalysisWrapper = !isGeneric && child.querySelector('.analysis-text');
                    const isTextWrapper = child.classList.contains('analysis-text') ||
                        (isGeneric && child.querySelector('p')) ||
                        isAnalysisWrapper;

                    if (isTextWrapper) {
                        let targetNode = child;
                        if (child.classList.contains('analysis-text')) {
                            targetNode = child;
                        } else if (child.querySelector('.analysis-text')) {
                            targetNode = child.querySelector('.analysis-text');
                        } else if (child.querySelector('p')) {
                            targetNode = child.querySelector('p');
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
                                        newNode = child.cloneNode(false);
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

                    if (splitDone) {
                        contentMoved = true;
                    } else {
                        if (!isCriticalOverflow) {
                            newContentContainer.appendChild(child);
                            contentMoved = true;
                        }
                    }
                }
            }

            if (newContentContainer && newContentContainer.children.length === 0 && !contentMoved) {
                newPage.remove();
            }

        }
        pageIndex++;
        safetyCounter++;
    }
};

module.exports = {
    generatePDF
};
