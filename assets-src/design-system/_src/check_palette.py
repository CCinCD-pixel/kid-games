"""Colour-vision check for the per-game accents + semantic colours.
Machado et al. 2009 (severity 1.0) simulation in linear RGB, distance = CIEDE2000.
Prints the closest pairs under normal / protan / deutan / tritan vision and WCAG
contrast of white text on each accent's base + deep (buttons use white on base/deep)."""
import re, itertools, math, sys
import numpy as np
css = open('tokens.css').read()
def var(n): return re.search(r'--xg-%s:\s*(#[0-9a-fA-F]{6})' % re.escape(n), css).group(1)
GAMES = ['mars','moon','rabbit','story','lab','porter','chess','army','snake','match','defense']
M = {
 'protan': [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 'deutan': [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 'tritan': [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
}
def hex2lin(h):
    c = np.array([int(h[i:i+2],16)/255 for i in (1,3,5)])
    return np.where(c<=.04045, c/12.92, ((c+.055)/1.055)**2.4)
def lin2lab(l):
    l=np.clip(l,0,1); X=l@np.array([[.4124,.3576,.1805],[.2126,.7152,.0722],[.0193,.1192,.9505]]).T
    Xn=np.array([.95047,1,1.08883]); t=X/Xn
    f=np.where(t>(6/29)**3, np.cbrt(t), t/(3*(6/29)**2)+4/29)
    return np.array([116*f[1]-16, 500*(f[0]-f[1]), 200*(f[1]-f[2])])
def de2000(a,b):
    L1,a1,b1=a; L2,a2,b2=b
    C1=math.hypot(a1,b1); C2=math.hypot(a2,b2); Cb=(C1+C2)/2
    G=.5*(1-math.sqrt(Cb**7/(Cb**7+25**7))); a1p=(1+G)*a1; a2p=(1+G)*a2
    C1p=math.hypot(a1p,b1); C2p=math.hypot(a2p,b2)
    h1=math.degrees(math.atan2(b1,a1p))%360; h2=math.degrees(math.atan2(b2,a2p))%360
    dL=L2-L1; dC=C2p-C1p
    dh=h2-h1; dh = dh-360 if dh>180 else dh+360 if dh<-180 else dh
    if C1p*C2p==0: dh=0
    dH=2*math.sqrt(C1p*C2p)*math.sin(math.radians(dh/2))
    Lb=(L1+L2)/2; Cbp=(C1p+C2p)/2
    hb=(h1+h2)/2 if abs(h1-h2)<=180 else (h1+h2+360)/2 if h1+h2<360 else (h1+h2-360)/2
    if C1p*C2p==0: hb=h1+h2
    T=1-.17*math.cos(math.radians(hb-30))+.24*math.cos(math.radians(2*hb))+.32*math.cos(math.radians(3*hb+6))-.2*math.cos(math.radians(4*hb-63))
    SL=1+.015*(Lb-50)**2/math.sqrt(20+(Lb-50)**2); SC=1+.045*Cbp; SH=1+.015*Cbp*T
    RT=-2*math.sqrt(Cbp**7/(Cbp**7+25**7))*math.sin(math.radians(60*math.exp(-((hb-275)/25)**2)))
    return math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH))
def lum(h):
    l=hex2lin(h); return .2126*l[0]+.7152*l[1]+.0722*l[2]
def contrast(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+.05)/(lb+.05)
def report(names, title, n=4):
    cols={k:var(k) for k in names}
    print(f'\n== {title}')
    for mode in ['normal','protan','deutan','tritan']:
        labs={}
        for k,h in cols.items():
            l=hex2lin(h)
            if mode!='normal': l=np.array(M[mode])@l
            labs[k]=lin2lab(l)
        pairs=sorted((de2000(labs[a],labs[b]),a,b) for a,b in itertools.combinations(names,2))
        print(f'{mode:7s} closest:', ', '.join(f'{a}/{b} {d:.1f}' for d,a,b in pairs[:n]))
report(GAMES,'game accents (base)')
report(['ok-500','try-500','info-500','danger-500'],'semantic')
print('\nwhite-text contrast on accent base / deep (≥3:1 for 22px+ bold, ≥4.5 ideal):')
for g in GAMES:
    print(f'  {g:8s} base {contrast(var(g),"#ffffff"):.2f}  deep {contrast(var(g+"-deep"),"#ffffff"):.2f}  ink-on-soft {contrast(var(g+"-soft"),"#261c30"):.1f}')
for k in ['jade-500','jade-600','jade-700','gold-500','cinnabar-500','cinnabar-600','ok-600','try-600','info-600']:
    print(f'  {k:12s} white {contrast(var(k),"#ffffff"):.2f}  ink {contrast(var(k),"#261c30"):.2f}')
