import fitz, json, sys, os, re
from PIL import Image, ImageChops
import extract
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','public','artikelbilder'); os.makedirs(out,exist_ok=True)
index={}; stat={'img':0,'skip':0}
def lade(doc,xref):
    pix=fitz.Pixmap(doc,xref)
    if pix.colorspace and pix.colorspace.n>=4: pix=fitz.Pixmap(fitz.csRGB,pix)
    elif pix.colorspace and pix.colorspace.n==1: pix=fitz.Pixmap(fitz.csRGB,pix)
    sm=doc.xref_get_key(xref,'SMask')
    im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples).convert('RGBA')
    if sm[0]=='xref':
        sx=int(sm[1].split()[0]); mp=fitz.Pixmap(doc,sx)
        m=Image.frombytes('L',(mp.width,mp.height),mp.samples) if mp.n==1 else None
        if m is not None: im.putalpha(m.resize(im.size))
    bg=Image.new('RGB',im.size,'white'); bg.paste(im,mask=im.split()[3]); return bg
for pdf in sys.argv[1:]:
    doc=fitz.open(pdf); r,s=extract.run(pdf,None); print(os.path.basename(pdf),s)
    cache={}
    for k,e in r.items():
        pg=doc[e['seite']-1]; rect=fitz.Rect(e['rect'])
        xr=[x for rr,x in extract.bild_dicht(pg) if abs(rr.x0-rect.x0)<.5 and abs(rr.y0-rect.y0)<.5]
        if not xr: stat['skip']+=1; continue
        xref=xr[0]
        if xref not in cache:
            try:
                im=lade(doc,xref)
                bb=ImageChops.difference(im,Image.new('RGB',im.size,'white')).point(lambda v:255 if v>14 else 0).getbbox()
                if not bb: cache[xref]=None
                else:
                    im=im.crop(bb)
                    if min(im.size)<24: cache[xref]=None
                    else:
                        im.thumbnail((240,160)); name=f"{os.path.basename(pdf).split('_')[-1][:2].lower()}-{xref}.jpg"
                        im.save(os.path.join(out,name),quality=84); cache[xref]=name; stat['img']+=1
            except Exception as ex: cache[xref]=None
        if not cache[xref]: stat['skip']+=1; continue
        for a in e['arts']: index.setdefault(a,cache[xref])
json.dump(index,open(os.path.join(out,'index.json'),'w'),indent=0,sort_keys=True)
print(stat,len(index))
