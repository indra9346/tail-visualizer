from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, ListFlowable, ListItem
from xml.sax.saxutils import escape

OUT = r"C:\Users\K S Indra Kumar\projects\tile-visualizer\docs\SDS-Tiles-Design-and-Motion-Guide.pdf"
CLAY = colors.HexColor("#9a5b34")
INK = colors.HexColor("#1c1917")
SOFT = colors.HexColor("#f5efe9")

ss = getSampleStyleSheet()
body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, spaceAfter=6)
h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=CLAY, spaceBefore=6, spaceAfter=8)
h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=4)
title = ParagraphStyle("t", parent=body, fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=CLAY, spaceAfter=4)
sub = ParagraphStyle("s", parent=body, fontSize=13, leading=18, textColor=colors.HexColor("#57534e"))
cell = ParagraphStyle("c", parent=body, fontSize=9.5, leading=13, spaceAfter=0)
cellb = ParagraphStyle("cb", parent=cell, fontName="Helvetica-Bold")
note = ParagraphStyle("n", parent=body, fontSize=10, leading=14, backColor=SOFT, borderPadding=8, spaceBefore=6, spaceAfter=12)
codest = ParagraphStyle("code", parent=body, fontName="Courier", fontSize=8.5, leading=11.5, backColor=SOFT, borderPadding=6, spaceAfter=12)


def P(t, s=body):
    return Paragraph(t, s)


def bullets(items):
    return ListFlowable([ListItem(P(i), leftIndent=14) for i in items], bulletType="bullet", start="\u2022", leftIndent=14, bulletFontSize=9)


def table(rows, widths):
    data = [[P(c, cellb if r == 0 else cell) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


def code(text):
    safe = escape(text).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
    return Paragraph(safe, codest)


def swatch(rows):
    data = [[P(n, cell), "", P(use, cell)] for n, hx, use, dark in rows]
    t = Table([[P("Name", cellb), P("Colour", cellb), P("Use it for", cellb)]] + data, colWidths=[38 * mm, 32 * mm, 100 * mm])
    st = [("BACKGROUND", (0, 0), (-1, 0), SOFT), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]
    for i, (n, hx, use, dark) in enumerate(rows, 1):
        st.append(("BACKGROUND", (1, i), (1, i), colors.HexColor(hx)))
    t.setStyle(TableStyle(st))
    return t


def footer(c, d):
    c.saveState()
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#78716c"))
    c.drawString(20 * mm, 10 * mm, "SDS TILES & CERAMICS  |  Design and Motion Guide")
    c.drawRightString(190 * mm, 10 * mm, "Page %d" % d.page)
    c.restoreState()


s = [Spacer(1, 50 * mm), P("SDS TILES &amp; CERAMICS", title), P("Design and Motion Guide", sub), Spacer(1, 8 * mm),
     P("Colours, type, animation, 3D effects and mobile rules for the Virtual Trial Room. The colours and fonts match what the app already uses, "
       "and the code snippets are ready to copy.", body), PageBreak()]

s += [P("1. Look and feel", h1),
      P("The brand is warm, premium and calm, like a quality showroom: soft cream backgrounds, clay and stone browns, one dark accent for buttons, "
        "and a serif headline font for a classic feel. Keep everything else quiet so the customer's tiles are the star."),
      P("Colour palette", h2),
      swatch([("Clay 50 (#faf6f1)", "#faf6f1", "Page backgrounds, soft cards", False), ("Clay 100 (#f3ebe1)", "#f3ebe1", "Highlight panels, hover fills", False),
              ("Clay 300 (#d4b892)", "#d4b892", "Borders on selected items", False), ("Clay 500 (#ab8050)", "#ab8050", "Icons, small accents", True),
              ("Clay 700 (#725136)", "#725136", "Links and text buttons", True), ("Clay 900 (#4c3829)", "#4c3829", "Dark brown headings on cream", True),
              ("Stone 900 (#1c1917)", "#1c1917", "Main text and primary buttons", True), ("Stone 950 (#0d0c0b)", "#0d0c0b", "Dark hero sections", True),
              ("Red 700 (#b91c1c)", "#b91c1c", "Delete and error messages", True)]),
      P("Typography", h2),
      table([["Role", "Font", "Size on phone / desktop"], ["Headlines", "Fraunces (serif)", "28 px / 40 px, semi-bold"],
             ["Section titles", "Fraunces", "20 px / 24 px"], ["Body text", "Inter", "15 px / 16 px, line height 1.6"],
             ["Small labels", "Inter, uppercase, wide spacing", "11-12 px, semi-bold"]], [40, 60, 70]),
      P("Spacing, corners and shadows", h2),
      bullets(["Use steps of 4 px: 8, 12, 16, 24, 32, 48.", "Cards: 16 px rounded corners. Bottom sheets and big panels: 24 px.",
               "Card shadow: soft and wide, never dark or sharp.", "Buttons are at least 44 px tall so thumbs hit them easily."]),
      PageBreak()]

s += [P("2. Animation rules", h1),
      P("Good animation explains what happened. Bad animation slows people down. Use these timings everywhere so the app feels consistent."),
      table([["Moment", "Effect", "Time"], ["Page opens", "Fade in and rise 10 px", "350 ms, ease-out"],
             ["Cards in a list", "Appear one after another", "60 ms apart"], ["Button press", "Shrinks to 97 percent", "120 ms"],
             ["Hover on a card", "Lifts 4 px, shadow grows", "200 ms"],
             ["Dialog or sheet", "Slides up from the bottom on phones, fades in on desktop", "250 ms"],
             ["Result reveal", "Before and after slider fades in", "500 ms"],
             ["Generating preview", "Progress steps with a soft pulse, never a frozen screen", "Looping while waiting"]], [45, 85, 40]),
      P("Framer Motion recipes (already installed)", h2),
      code("// Fade and rise\n<motion.div initial={{ opacity: 0, y: 10 }}\n  animate={{ opacity: 1, y: 0 }}\n  transition={{ duration: 0.35, ease: 'easeOut' }} />"),
      code("// Staggered list\nconst list = { show: { transition: { staggerChildren: 0.06 } } };\nconst item = {\n  hidden: { opacity: 0, y: 12 },\n  show: { opacity: 1, y: 0 },\n};"),
      code("// Press feedback\n<motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} />"),
      P("Always respect people who turn motion off in their device settings. The background mist already switches itself off in that case. "
        "For other animations, wrap the app in MotionConfig with reducedMotion set to user, so one setting covers everything.", note),
      PageBreak()]

s += [P("3. 3D effects and realistic visuals", h1),
      P("These effects add depth without heavy 3D libraries, so the app stays fast on phones."),
      P("Tilting tile cards", h2),
      P("When the mouse moves over a tile card, the card leans slightly, like holding a real tile sample."),
      code(".tile-card { transform-style: preserve-3d; perspective: 900px;\n  transition: transform 200ms ease-out; }\n.tile-card:hover {\n  transform: rotateX(4deg) rotateY(-6deg) translateY(-4px);\n}"),
      P("Glossy shine on tiles", h2),
      code(".shine { position: relative; overflow: hidden; }\n.shine::after { content: ''; position: absolute; inset: 0;\n  background: linear-gradient(115deg, transparent 40%,\n    rgba(255,255,255,.35) 50%, transparent 60%);\n  transform: translateX(-120%); transition: transform 700ms; }\n.shine:hover::after { transform: translateX(120%); }"),
      P("Depth for hero sections", h2),
      bullets(["Layer 2 or 3 images that move at different speeds when scrolling (slow background, faster foreground) for a parallax feel.",
               "Soft shadow under floating objects, in a darker tone of the page, never pure black.",
               "Gentle gradient on dark sections, from Stone 950 to Stone 925."]),
      P("Realistic previews", h2),
      bullets(["Show the before and after slider full width on phones, with zoom.", "Keep a thin white divider and a round handle, as in the current design.",
               "Always store the real tile size in millimetres so tiles look the right size in the room.",
               "A true 3D room walkthrough is a separate project: it needs a 3D model of the room and a library such as Three.js."]),
      PageBreak()]

s += [P("4. Mobile rules", h1),
      P("Most customers will look at this on a phone beside the tile shelf. Follow these rules on every page."),
      table([["Screen", "Width", "Layout"], ["Phone", "under 640 px", "One column, bottom sheets for pickers, big buttons"],
             ["Tablet", "640 to 1023 px", "Two columns for cards"], ["Laptop and up", "1024 px and more", "Side panel plus main area"]], [40, 40, 90]),
      Spacer(1, 4 * mm),
      bullets(["No sideways scrolling. The public pages were checked at phone width and have none.",
               "Touch targets are at least 44 by 44 px, with space between them.",
               "Pickers open as a sheet from the bottom of the screen and close by tapping outside.",
               "The Preview button stays visible at the bottom while designing.",
               "Images load lazily and at the size they are shown.",
               "Decorative animation is lighter on phones: fewer particles and a lower frame rate."]),
      P("5. Speed rules (no waiting around)", h1),
      bullets(["Pages load only when opened, so the first screen is small.", "Big libraries are cached separately and stay cached between updates.",
               "A loading placeholder shows while a page opens, so the screen is never blank.",
               "If a page crashes, a recovery screen with a Reload button appears instead of a white page.",
               "Generation shows clear progress steps, and the credit hold is released automatically if it fails."]),
      P("These guidelines make the app feel polished and responsive, but nothing can make an AI-generated preview an exact measurement. "
        "Always confirm real tile quantities and layout on site.", note)]

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                  title="SDS Tiles & Ceramics - Design and Motion Guide", author="SDS Tiles & Ceramics").build(
    s, onFirstPage=lambda c, d: None, onLaterPages=footer)
print("done")
