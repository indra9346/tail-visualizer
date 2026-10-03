from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, ListFlowable, ListItem

OUT = r"C:\Users\K S Indra Kumar\projects\tile-visualizer\docs\SDS-Tiles-User-Guide.pdf"
CLAY = colors.HexColor("#9a5b34")
INK = colors.HexColor("#1c1917")
SOFT = colors.HexColor("#f5efe9")

ss = getSampleStyleSheet()
body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, spaceAfter=6)
h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=CLAY, spaceBefore=6, spaceAfter=8)
h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4)
title = ParagraphStyle("t", parent=body, fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=CLAY, spaceAfter=4)
sub = ParagraphStyle("s", parent=body, fontSize=13, leading=18, textColor=colors.HexColor("#57534e"))
cell = ParagraphStyle("c", parent=body, fontSize=9.5, leading=13, spaceAfter=0)
cellb = ParagraphStyle("cb", parent=cell, fontName="Helvetica-Bold")
note = ParagraphStyle("n", parent=body, fontSize=10, leading=14, backColor=SOFT, borderPadding=8, spaceBefore=6, spaceAfter=12)

def P(t, s=body): return Paragraph(t, s)
def bullets(items):
    return ListFlowable([ListItem(P(i), leftIndent=14) for i in items], bulletType="bullet", start="\u2022", leftIndent=14, bulletFontSize=9)
def steps(items):
    return ListFlowable([ListItem(P(i), leftIndent=18) for i in items], bulletType="1", leftIndent=18)
def table(rows, widths):
    data = [[P(c, cellb if r == 0 else cell) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t

def footer(c, d):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(colors.HexColor("#78716c"))
    c.drawString(20 * mm, 10 * mm, "SDS TILES & CERAMICS  |  Virtual Trial Room  |  User Guide")
    c.drawRightString(190 * mm, 10 * mm, f"Page {d.page}"); c.restoreState()

s = []
s += [Spacer(1, 50 * mm), P("SDS TILES &amp; CERAMICS", title), P("Virtual Trial Room", sub), Spacer(1, 6 * mm),
      P("User Guide and Data Guide", sub), Spacer(1, 10 * mm),
      P("A simple guide for showroom owners and staff: how to show customers their own room with new tiles, "
        "and what information the software keeps.", body),
      Spacer(1, 6 * mm), P("Website: https://tile-visualizer-roan.vercel.app", body), PageBreak()]

s += [P("1. What this software does", h1),
      P("Take a photo of the customer's room, choose tiles from your catalog, and the software shows a realistic "
        "picture of the room with those tiles fitted. The customer sees the result before buying anything."),
      P("You can choose different tiles for different walls, the floor, steps, a kitchen backsplash or a bathroom shower wall. "
        "On a single wall you can also mix tiles in a pattern, such as a dark tile at the bottom with a light tile above it."),
      P("The pictures are AI-generated previews. They are very useful for choosing, but they are not exact measurements. "
        "Always confirm tile quantity and layout on site.", note),
      P("2. The big picture: how work flows", h1),
      table([["Step", "What you do", "Where"],
             ["1", "Sign in", "Login page"],
             ["2", "Add your tiles (once, then reuse)", "My Tiles"],
             ["3", "Upload a photo of the customer's room", "Upload"],
             ["4", "The software studies the photo (walls, floor, lighting)", "Analysis (automatic)"],
             ["5", "Choose which tile goes where and in what pattern", "Design Studio (Tiles page)"],
             ["6", "Generate the preview and show the customer", "Result page"],
             ["7", "Save it, download it, or try another design", "Result page / Saved Projects"]],
            [14, 100, 56]),
      PageBreak()]

s += [P("3. Getting started", h1),
      P("Signing in", h2),
      P("Sign in with the email and password given to you. Accounts are created by the shop owner. Once you are in, the "
        "side menu (the Menu button, top right) takes you to every page."),
      P("Credits", h2),
      P("Each preview you generate uses credits, like a prepaid balance. The default cost is <b>10 credits per attempt</b>. "
        "You can see your balance and top up on the Credits page. If a generation fails, the credits are returned to you automatically."),
      P("My Tiles: adding your own tiles", h1),
      steps(["Open <b>My Tiles</b> from the menu.", "Add a new tile with a clear photo of the tile surface (a flat, well-lit picture with no background).",
             "Enter the name, brand, size (in millimetres, for example 300 x 600), and finish.",
             "Choose where the tile can be used: floor, wall, or both. The software only offers a tile where it makes sense.",
             "Save. The tile now appears in your catalog and in the tile picker."]),
      P("Tip: the size you enter affects how big the tile looks in the preview. Check it carefully; a wrong size gives an odd-looking result.", note),
      PageBreak()]

s += [P("4. Making a preview, step by step", h1),
      P("Step 1: Upload the room photo", h2),
      bullets(["Open <b>Upload</b> and pick a project (or create one, for example the customer's name).",
               "Use a bright, sharp photo taken straight on. Avoid heavy shadows and very close-ups of one corner.",
               "Make sure the part to be tiled (wall, floor or steps) is clearly visible."]),
      P("Step 2: Check the analysis", h2),
      P("The software describes what it sees: room type, walls, floor, and any issues, such as \"floor is not visible\". "
        "Read the issues; they warn you about things that can reduce quality."),
      P("Step 3: Design Studio, choosing tiles for each area", h2),
      P("An <b>area</b> is one part of the room that gets its own tiles, for example \"Left wall\" or \"Floor\". For each area:"),
      steps(["<b>Surface</b>: wall, floor, step tread (the flat top of a step), step riser (the upright face), backsplash or shower wall.",
             "<b>Which part?</b> Name it in your own words so it matches the photo, such as \"Wall behind basin\". Quick-name buttons are provided.",
             "<b>Layout pattern</b>: choose how tiles are arranged (see the table below).",
             "<b>Choose tiles</b>: click each tile slot and pick from your catalog. If the tile you want is not there, use <b>Add a custom tile</b> inside the picker.",
             "<b>Pattern note</b> (optional): add details such as \"dado up to 3 ft\"."]),
      P("You can have up to 6 areas and up to 8 different tiles in one design. Use <b>Add another area</b> for more walls, the floor, steps, and so on.", body),
      PageBreak()]

s += [P("Layout patterns", h1),
      P("Pick the pattern the customer asked for. Each one tells the software exactly how to arrange the tiles."),
      table([["Pattern", "Meaning"],
             ["Single tile (plain)", "One tile laid evenly across the whole area."],
             ["Dado (lower + upper)", "One tile below, another above. Add a height in the note, for example 3 ft."],
             ["Checkerboard", "Two tiles alternating like a chessboard."],
             ["Horizontal bands", "Rows of different tiles stacked across the area."],
             ["Vertical stripes", "Upright stripes of different tiles."],
             ["Highlighter strip", "A narrow decorative strip, for example at 5 ft height."],
             ["Border frame", "A main tile framed by a border of another tile."],
             ["Feature panel", "A centred accent panel, for example behind the basin or mirror."],
             ["Herringbone", "Interlocking zig-zag laying (a second tile is optional)."],
             ["Diagonal (45 degrees)", "Tiles turned 45 degrees to the walls (a second tile is optional)."],
             ["Random mix", "A pleasing random blend of 2 to 4 tiles."]],
            [50, 120]),
      P("Step 4: Requirements (optional but powerful)", h2),
      P("Use the requirements box for anything the pictures cannot say. Good examples:"),
      bullets(["\"Keep the switchboard, plug points and window untouched; tile neatly around them.\"",
               "\"Tiles should run the full wall height up to the ceiling.\"",
               "\"Keep the curtain and furniture exactly as they are.\""]),
      P("Step 5: Generate", h2),
      P("Check the credit cost in the bottom bar and press Generate. It takes a short time. When it finishes you see the result page."),
      P("The Result page", h1),
      bullets(["<b>Before / After slider</b>: drag the divider to compare. Use zoom to inspect details.",
               "<b>Design summary</b>: shows each area with its pattern and tiles.",
               "<b>Save Visualization</b>: downloads the picture.",
               "<b>Edit Design / Try Another</b>: go back and change tiles or patterns. Each retry of the same design may be limited to 3 attempts.",
               "<b>Delete</b>: removes this visualization permanently."]),
      PageBreak()]

s += [P("5. Saved work and deleting", h1),
      P("Everything you make is saved to your account automatically."),
      table([["Page", "What it holds"],
             ["Saved Projects", "Each customer or job is a project. Inside are its room photos."],
             ["My Visualizations", "All previews you generated. You can mark them public or private, or delete them."],
             ["Credits / Payments", "Your balance, top-ups, and the history of payments."]],
            [50, 120]),
      P("Deleting", h2),
      bullets(["<b>Delete a room photo</b>: removes the photo, its analysis and all previews made from it.",
               "<b>Delete a project</b>: removes the project with all its rooms and previews.",
               "<b>Delete a visualization</b>: removes just that preview and its image."]),
      P("Deleting is permanent and cannot be undone. Credits already used are not refunded. You always get a confirmation question first.", note),
      P("6. Tips for the best results", h1),
      bullets(["Use bright, sharp, straight-on room photos.",
               "Keep tile photos clean and flat, with correct sizes.",
               "Name each area exactly as the customer would describe it.",
               "Put the darker or more textured tile at the bottom of a dado.",
               "Tell the software what to keep unchanged, such as switchboards, windows, curtains and furniture.",
               "Change several things at once between attempts instead of one at a time, because each attempt uses credits.",
               "Show the result as a guide, and confirm real measurements and the layout on site."]),
      PageBreak()]

s += [P("7. About your data, in simple words", h1),
      P("The software stores the following. Think of it as a set of labelled cupboards."),
      table([["What", "What it contains", "Who can see it"],
             ["Account", "Your name, email and sign-in details.", "Only you (passwords are handled by the secure sign-in service and are never visible to staff)."],
             ["Projects", "The names of your customer jobs.", "Only you."],
             ["Room photos", "The photos you upload and the AI's description of each room.", "Only you."],
             ["Tiles", "Tile name, brand, size, finish, photo, and where it can be used.", "Your own tiles are yours. Shared catalog tiles are visible to all signed-in users."],
             ["Designs", "For each preview: which tile is on which area, the pattern, your note, and the requirements text.", "Only you (unless you make that preview public)."],
             ["Preview images", "The finished before/after picture.", "Only you, or everyone if you set it public."],
             ["Credits &amp; payments", "Balance, what each generation cost, and payment records.", "Only you and the shop admin."]],
            [28, 76, 66]),
      P("Where it is kept", h2),
      P("Data lives in a secure online database and file storage (Supabase). The website runs on Vercel. "
        "Pictures are shown through temporary private links, so only the right person can open them."),
      P("What the AI sees", h2),
      P("To create a preview, your room photo, the chosen tile photos and your written instructions are sent to Google's Gemini AI. "
        "Only what is needed for that one preview is sent, and the secret key for the AI stays on the server, never in the browser."),
      P("Your control", h2),
      bullets(["You choose whether each preview is public or private.", "You can delete any room, project or preview whenever you like.",
               "Never share your password. Sign out on shared computers."]),
      PageBreak()]

s += [P("8. Troubleshooting", h1),
      table([["Problem", "What to do"],
             ["The preview hides a switchboard or fitting", "Write in Requirements: \"Keep the switchboard untouched; tile around it.\" and generate again."],
             ["Tiles look too big or too small", "Correct the tile's size in My Tiles, then generate again."],
             ["The pattern is not what I wanted", "Choose the right pattern, add a note such as \"dado up to 3 ft\", and retry."],
             ["Floor option does not work", "The photo must show the floor. Upload another photo that includes it."],
             ["Generation failed", "Try again. Failed attempts return your credits. If it keeps failing, tell the shop admin."],
             ["Not enough credits", "Open the Credits page and top up."],
             ["I can't find a tile", "Use \"Add a custom tile\" in the tile picker, or add it in My Tiles first."]],
            [60, 110]),
      Spacer(1, 8 * mm),
      P("9. Quick checklist before showing a customer", h2),
      bullets(["Room photo is bright and the target area is visible.", "Every tile has the correct size.", "Each area is named clearly.",
               "Pattern and tiles match the customer's request.", "Requirements say what must stay unchanged.", "Credit balance is enough."]),
      Spacer(1, 6 * mm),
      P("Remember: this is a visual guide. Confirm real measurements, quantity and finish with the customer before ordering.", note)]

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                  title="SDS Tiles & Ceramics - User Guide", author="SDS Tiles & Ceramics").build(s, onFirstPage=lambda c, d: None, onLaterPages=footer)
print("done")
