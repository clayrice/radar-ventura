"""Rebuild the daily masthead with the site's fonts and official logo (Pillow)."""
from pathlib import Path
from math import sqrt
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
W, H = 1800, 540
image = Image.new('RGB', (W, H))
pixels = image.load()
paper, lime, purple = (247,246,239), (219,255,79), (119,114,242)
for y in range(H):
 for x in range(W):
  a = max(0, 1-sqrt((x/W/0.85)**2+(y/H/1.6)**2))*0.91
  b = max(0, 1-sqrt(((x/W-1)/0.90)**2+((y/H-.82)/1.6)**2))*0.65
  c = [round(paper[i]*(1-a)+lime[i]*a) for i in range(3)]
  pixels[x,y] = tuple(round(c[i]*(1-b)+purple[i]*b) for i in range(3))
draw = ImageDraw.Draw(image)
grotesk = ImageFont.truetype(str(ROOT/'public/fonts/space-grotesk-600.ttf'),170)
serif = ImageFont.truetype(str(ROOT/'public/fonts/instrument-serif-italic.ttf'),205)
small = ImageFont.truetype(str(ROOT/'public/fonts/space-grotesk-600.ttf'),30)
ink = '#15142F'
draw.text((84,36), 'RADAR DIÁRIO', font=small, fill='#524FF5')
draw.text((80,82), 'IA com', font=grotesk, fill=ink)
# The lime highlight and serif italic reproduce the site's headline treatment.
draw.rectangle((82,325,528,473), fill='#DBFF4F')
draw.text((82,247), 'rumo.', font=serif, fill=ink)
logo = Image.open(ROOT/'public/brand/ventura-indigo.png').convert('RGBA')
logo.thumbnail((570,150), Image.Resampling.LANCZOS)
image.paste(logo, (W-84-logo.width, (H-logo.height)//2), logo)
image.save(ROOT/'public/brand/radar-daily-header.png', optimize=True)
print(f'Masthead saved: {W}x{H}')
