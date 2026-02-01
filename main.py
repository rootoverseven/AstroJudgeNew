import os
import requests
import time
import textwrap
from openai import OpenAI
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF

# Configuration
# Ensure you set these in your environment
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
FREE_ASTROLOGY_API_KEY = os.environ.get("FREE_ASTROLOGY_API_KEY") # Recommended if required by the API

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL_ID = "google/gemini-2.0-flash-exp:free"

def get_astrology_data(dob, tob, lat, lon):
    """
    Fetches planetary positions and chart SVGs.
    """
    print("--- Phase 1: Fetching Data ---")
    
    try:
        date_parts = dob.split('-')
        time_parts = tob.split(':')
        year = int(date_parts[0])
        month = int(date_parts[1])
        day = int(date_parts[2])
        hour = int(time_parts[0])
        minute = int(time_parts[1])
    except ValueError:
        print("Invalid date/time format.")
        return None, None

    payload = {
        "year": year,
        "month": month,
        "date": day,
        "hours": hour,
        "minutes": minute,
        "seconds": 0,
        "latitude": lat,
        "longitude": lon,
        "timezone": 5.5, 
        "config": {
            "observation_point": "topocentric",
            "ayanamsha": "lahiri",
            "chart_style": "NORTH_INDIAN"
        }
    }
    
    headers = {"Content-Type": "application/json"}
    if FREE_ASTROLOGY_API_KEY:
        headers["x-api-key"] = FREE_ASTROLOGY_API_KEY

    planets_data = {}
    charts = {}

    import time
    with open("debug_log.txt", "w", encoding="utf-8") as log:
        # 1. Fetch Planets
        print("Requesting planetary positions...")
        planets_url = "https://json.freeastrologyapi.com/planets"
        
        try:
            resp = requests.post(planets_url, json=payload, headers=headers)
            log.write(f"Planets Response Code: {resp.status_code}\n")
            log.write(f"Planets Response: {resp.text}\n")
            
            if resp.status_code == 200:
                data = resp.json()
                # Inspect potential keys
                if "output" in data:
                    planets_data = data["output"]
                elif "data" in data:
                    planets_data = data["data"]
                else:
                    planets_data = data
                
                log.write(f"Parsed Planets Data Type: {type(planets_data)}\n")
                if isinstance(planets_data, list):
                    log.write(f"Planets List Length: {len(planets_data)}\n")
                    if len(planets_data) > 0:
                        log.write(f"First Planet Sample: {planets_data[0]}\n")
                elif isinstance(planets_data, dict):
                    log.write(f"Planets Dict Keys: {list(planets_data.keys())}\n")
                
                print("Planets data received.")
            else:
                log.write("Failed to fetch planets.\n")
        except Exception as e:
            log.write(f"Exception fetching planets: {e}\n")

        # 2. Fetch Charts
        print("Requesting charts...")
        svg_url = "https://json.freeastrologyapi.com/horoscope-chart-svg-code"
        
        for chart_type in ["Lagna", "Navamsa"]:
            time.sleep(2)
            chart_payload = payload.copy()
            # Try specific parameters if needed, but 'chart_code' is a common guess
            # Some APIs use 'divisional_chart_type' or similar
            chart_payload["chart_code"] = chart_type
            
            try:
                resp = requests.post(svg_url, json=chart_payload, headers=headers)
                log.write(f"\n{chart_type} Chart Status: {resp.status_code}\n")
                
                if resp.status_code == 200:
                    try:
                        rj = resp.json()
                        log.write(f"{chart_type} Keys: {list(rj.keys())}\n")
                        content = rj.get("output") or rj.get("svg_code") or rj.get("data")
                        
                        if content:
                            charts[chart_type] = content
                            log.write(f"{chart_type} content found (len={len(content)})\n")
                        else:
                             # Fallback if the whole response is SVG or unknown structure
                            log.write(f"{chart_type} no standard key found. full json: {rj}\n")
                    except:
                        # Maybe it is raw text
                        charts[chart_type] = resp.text
                        log.write(f"{chart_type} treated as raw text. len={len(resp.text)}\n")
                else:
                    log.write(f"Failed to fetch {chart_type}: {resp.text}\n")
            except Exception as e:
                log.write(f"Exception fetching {chart_type}: {e}\n")

    return planets_data, charts

def interpret_placement(planet, sign, house):
    """
    Uses OpenRouter to generate insights.
    """
    if not OPENROUTER_API_KEY:
        return "OpenRouter API Key not found."

    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY
    )
    
    prompt = (
        f"Act as an expert Vedic Astrologer. A user has {planet} in {sign} in the {house} house. "
        "Write a 3-sentence insight about this. Tone: Mystical but practical. Focus on career and relationships."
    )
    
    try:
        completion = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return completion.choices[0].message.content
    except Exception as e:
        return f"Error gathering wisdom: {e}"

def draw_wrapped_text(c, text, x, y, max_width):
    """Helper to draw wrapped text on canvas"""
    lines = textwrap.wrap(text, width=int(max_width / 6)) # Approx char width
    for line in lines:
        c.drawString(x, y, line)
        y -= 14 # Line height
    return y

def main():
    print("--- Zero-Cost Vedic Astrology Report Generator ---")
    
    name = "Aditya Choudhary"
    dob = "1998-11-26" 
    tob = "07:55"
    lat = 21.216276
    lon = 81.323608
    
    print(f"Details: {name}, {dob} {tob}, Lat: {lat}, Lon: {lon}")
    
    # Phase 1: Data
    planets_data, charts = get_astrology_data(dob, tob, lat, lon)
    
    if not planets_data:
        print("No planetary data retrieved. Exiting.")
        return

    # Phase 3 (and 2): PDF Builder
    print("--- Phase 3: Building PDF ---")
    pdf_file = "astrology_report.pdf"
    c = canvas.Canvas(pdf_file, pagesize=A4)
    width, height = A4
    
    # Page 1: Title & Details
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width/2, height - 100, "Vedic Astrology Report")
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width/2, height - 130, f"For: {name}")
    
    c.setFont("Helvetica", 14)
    c.drawString(100, height - 200, "Birth Details:")
    c.setFont("Helvetica", 12)
    c.drawString(100, height - 230, f"Date: {dob}")
    c.drawString(100, height - 250, f"Time: {tob}")
    c.drawString(100, height - 270, f"Latitude: {lat}")
    c.drawString(100, height - 290, f"Longitude: {lon}")
    
    c.showPage()
    
    # Page 2: Charts
    # We save SVGs to temp files to use svglib
    def draw_chart(chart_key, title, y_pos):
        if chart_key in charts:
            svg_str = charts[chart_key]
            # Verify if svg_str is actually an SVG
            if "<svg" not in svg_str:
                return 0
            
            temp_name = f"temp_{chart_key}.svg"
            with open(temp_name, "w", encoding="utf-8") as f:
                f.write(svg_str)
            
            try:
                drawing = svg2rlg(temp_name)
                # Scale to fit
                # Assuming standard chart size, scale down
                sx = sy = 0.6
                drawing.scale(sx, sy)
                
                c.setFont("Helvetica-Bold", 16)
                c.drawString(100, y_pos, title)
                
                # Draw drawing
                renderPDF.draw(drawing, c, 50, y_pos - 350) 
            except Exception as e:
                print(f"Failed to render {chart_key}: {e}")
            finally:
                if os.path.exists(temp_name):
                    os.remove(temp_name)
    
    draw_chart('Lagna', "Lagna Chart (Birth Chart)", height - 50)
    draw_chart('Navamsa', "Navamsa Chart (D9)", height - 420)
    
    c.showPage()
    
    # Page 3: Interpretations
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width/2, height - 60, "Planetary Interpretations")
    
    y = height - 100
    
    y = height - 100
    
    print("Generating interpretations (this calls OpenRouter)...")
    
    # Iterate through planets
    # Structure seen in debug log: [{'0': {'name': 'Ascendant', ...}, '1': {'name': 'Sun', ...}}]
    iterable = []
    
    if isinstance(planets_data, list) and len(planets_data) > 0:
        first_item = planets_data[0]
        if isinstance(first_item, dict):
            # It seems the dictionary keys are "0", "1", etc.
            # We want to sort them or just iterate.
            for k, v in first_item.items():
                if isinstance(v, dict) and 'name' in v:
                    iterable.append((v['name'], v))
    elif isinstance(planets_data, dict):
         for k, v in planets_data.items():
             if isinstance(v, dict) and 'name' in v:
                 iterable.append((v['name'], v))

    # Sort iterable to ensure consistent order (e.g. by ID if possible, or name)
    # The output keys 0,1,2 imply an order.
    # We can rely on insertion order or sort by planet name/ID.
    # Let's simple sort by name for now, or keep as is.
    print(f"Found {len(iterable)} planets to interpret.")
    
    print("Generating interpretations (this calls OpenRouter)...")
    
    for planet_name, details in iterable:
        # Filter unwanted items
        if planet_name.lower() == 'ayanamsa':
            continue

        # Check if we need new page
        if y < 150:
            c.showPage()
            y = height - 60
        
        # Rate limit handling for OpenRouter Free Tier
        time.sleep(5) 

        # Extract Sign and House
        sign = details.get("current_sign", details.get("sign", "Unknown"))
        house = details.get("house_number", details.get("house", "Unknown House")) # Log showed 'house_number'
        
        # Phase 2: OpenRouter Interpretation
        insight = interpret_placement(planet_name, sign, house)
        
        # Draw on PDF
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, f"{planet_name} in Sign {sign} (House {house})")
        y -= 20
        
        c.setFont("Helvetica", 10)
        y = draw_wrapped_text(c, insight, 50, y, width - 100)
        y -= 20 # Spacing
        
    c.save()
    print(f"Done! Saved to {pdf_file}")

if __name__ == "__main__":
    main()
