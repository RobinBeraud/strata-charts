import json,sys,collections
d=json.load(open(sys.argv[1],encoding='utf-8'))
r=d['records'][0]['normalized_result']; g=r['graph']; sg=r['semantic_graph']
id2path={}; size={}
for n in g['nodes']:
    for o in n.get('observations',[]):
        p=o.get('properties',{}); fo=p.get('file_occurrence') or {}
        if fo.get('path'): id2path[n['node_id']]=fo['path']; size[fo['path']]=p.get('bytes',0)
        elif n['kind']=='javascript-module' and o.get('label'): id2path.setdefault(n['node_id'],o['label'])
imp=collections.defaultdict(set); kinds=collections.Counter()
for e in g['edges']:
    p=e.get('properties') or {}; kinds[(e.get('relation'),p.get('kind'))]+=1
    if p.get('kind')=='static-import' and p.get('resolved_path'):
        src=e['evidence']['location']['value'].get('source'); imp[src].add(p['resolved_path'])
print('edge relation kinds',kinds.most_common(12))
fanin=collections.Counter(t for s in imp for t in imp[s])
src=[p for p in imp if not p.startswith('masters/')]
print('files with imports',len(imp),'non-masters',len(src))
print('TOP FAN-IN'); [print(f'  {c:4d} {p}') for p,c in fanin.most_common(25)]
print('TOP FAN-OUT'); [print(f'  {len(imp[p]):4d} {p}') for p in sorted(src,key=lambda p:-len(imp[p]))[:15]]
print('LARGEST')
for p,b in [x for x in sorted(size.items(),key=lambda x:-x[1]) if not x[0].startswith('masters/') and x[0].endswith('.js')][:20]: print(f'  {b//1024:5d}KB {p}')
area=collections.Counter(); ab=collections.Counter()
for p,b in size.items():
    if p.endswith('.js') and not p.startswith('masters/'):
        a='/'.join(p.split('/')[:2]) if p.startswith(('Core','Extensions')) else p.split('/')[0]; area[a]+=1; ab[a]+=b
print('AREAS'); [print(f'  {c:4d} files {ab[a]//1024:6d}KB {a}') for a,c in area.most_common(30)]
# SCC (Tarjan iterative)
idx={};low={};st=[];on=set();sccs=[];i=[0]
import sys as _s; _s.setrecursionlimit(100000)
def sc(v):
    idx[v]=low[v]=i[0];i[0]+=1;st.append(v);on.add(v)
    for w in imp.get(v,()):
        if w not in idx: sc(w); low[v]=min(low[v],low[w])
        elif w in on: low[v]=min(low[v],idx[w])
    if low[v]==idx[v]:
        c=[]
        while True:
            w=st.pop();on.discard(w);c.append(w)
            if w==v:break
        if len(c)>1: sccs.append(c)
for v in list(imp): 
    if v not in idx: sc(v)
print('IMPORT CYCLES',len(sccs)); [print('  ',len(c),sorted(c)[:6]) for c in sccs[:10]]
# semantic: events, timers, endpoints, requests
for k in ('event','timer','request','boundary','listener'):
    ns=[n for n in sg['nodes'] if n.get('kind')==k]
    labs=collections.Counter()
    for n in ns:
        lab=n.get('label') or json.dumps(n.get('properties',{}))[:120]
        loc=(n.get('evidence') or {}).get('location',{}).get('value',{}).get('source','')
        labs[(str(lab)[:80],loc)]+=1
    print(k.upper(),len(ns)); [print('   ',c,l) for l,c in labs.most_common(12)]
eps=[n for n in g['nodes'] if n['kind']=='endpoint']
for n in eps: print('ENDPOINT',[o.get('label') for o in n['observations']][:2])
