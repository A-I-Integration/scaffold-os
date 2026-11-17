import fitz, re, json, sys, os, math
warn=lambda *a: None
ART=re.compile(r'^\d{4}\.\d{3}$')
LAB=re.compile(r'^(\d{1,2})([a-c]?)$')

def table_rows(page):
    words=page.get_text('words')
    arts=[w for w in words if ART.match(w[4]) and w[0]>300]
    if not arts: return {},[]
    ymin=min(w[1] for w in arts)-400
    pos=[(w[1],w[4]) for w in words if w[0]<46 and re.match(r'^\d{1,2}$',w[4]) and w[1]>60 and w[1]<page.rect.height-60]
    pos.sort()
    sub=[(w[1],w[4]) for w in words if 46<=w[0]<70 and re.match(r'^[a-c]$',w[4])]
    rows={}
    for a in sorted(arts,key=lambda w:w[1]):
        above=[p for p in pos if p[0]<=a[1]+2]
        if not above: continue
        py,pn=above[-1]
        # Untergruppe a/b: letzter Buchstabe zwischen Positionsbeginn und Artikel
        s=[x for x in sub if py-2<=x[0]<=a[1]+2]
        lab=pn+(s[-1][1] if s else '')
        rows.setdefault(lab,[]).append(a[4])
    ymin_tab=min(p[0] for p in pos) if pos else 0
    return rows, ymin_tab

def labels(page, ytab):
    out=[]
    for w in page.get_text('words'):
        m=LAB.match(w[4])
        if m: out.append((w, w[4]))
    return out

def bild_dicht(page):
    res=[]
    for i in page.get_image_info(xrefs=True):
        r=fitz.Rect(i['bbox'])
        if r.width<14 or r.height<10: continue
        if r.width*r.height>page.rect.width*page.rect.height*0.35: continue
        res.append((r,i['xref']))
    return res

def finde(page, lab, ytab_exclude=None):
    ws=[w for w in page.get_text('words') if w[4]==lab]
    bs=bild_dicht(page)
    best=None
    for w in ws:
        cx,cy=(w[0]+w[2])/2,(w[1]+w[3])/2
        if ytab_exclude and w[1]>=ytab_exclude[0] and w[0]<ytab_exclude[1]: continue
        for r,x in bs:
            dx=max(r.x0-cx,0,cx-r.x1); dy=max(r.y0-cy,0,cy-r.y1)
            d=math.hypot(dx,dy)
            if best is None or d<best[0]: best=(d,r,x)
    return best

def run(path, out, maxdist=30):
    d=fitz.open(path); res={}; stat={'pos':0,'hit':0}
    for pn in range(len(d)):
        page=d[pn]
        rows,ytab=table_rows(page)
        if not rows: continue
        for lab,arts in rows.items():
            stat['pos']+=1
            hit=None
            for q in (pn,pn-1,pn-2):
                if q<0: continue
                pg=d[q]
                b=finde(pg,lab,(ytab-6,60) if q==pn else None)
                if b and b[0]<=maxdist: hit=(q,b); break
            if not hit: continue
            stat['hit']+=1
            q,b=hit
            res[lab+'@'+str(pn+1)]={'arts':arts,'seite':q+1,'rect':[b[1].x0,b[1].y0,b[1].x1,b[1].y1],'dist':round(b[0],1)}
    return res,stat
if __name__=='__main__':
    r,s=run(sys.argv[1],None)
    print(s)
    json.dump(r,open(sys.argv[2],'w'))
