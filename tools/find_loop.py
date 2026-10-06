import sys, glob, numpy as np
from PIL import Image
d=sys.argv[1]; fs=sorted(glob.glob(d+'/f_*.png'))
A=np.stack([np.array(Image.open(f).convert('RGB').resize((168,112))).astype(np.float32) for f in fs])
sk=(A[...,2]-A[...,0]>45)&(A[...,2]-A[...,1]>22); fg=~sk
ys,xs=np.mgrid[0:112,0:168]
cx=[(xs*m).sum()/m.sum() for m in fg]; cy=[(ys*m).sum()/m.sum() for m in fg]; area=[m.mean() for m in fg]
print('centroid x min/max %.1f/%.1f (of 168)  first/last %.1f/%.1f; area min/max %.3f/%.3f first/last %.3f/%.3f'%(min(cx),max(cx),cx[0],cx[-1],min(area),max(area),area[0],area[-1]))
N=len(A); best=[]
consec=np.mean([np.abs(A[i+1]-A[i]).mean() for i in range(N-1)])
for i in range(N):
    for j in range(i+18,min(N,i+110)):
        best.append((np.abs(A[i]-A[j]).mean(),i,j))
best.sort()
print('avg consecutive diff %.2f'%consec)
for b in best[:8]: print('  loop %d->%d len %d diff %.2f'%(b[1],b[2],b[2]-b[1],b[0]))
