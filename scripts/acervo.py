import json, re, time, urllib.request, urllib.parse, os
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
P=ROOT/'acervo.json'
data=json.loads(P.read_text())
class Links(HTMLParser):
 def __init__(self): super().__init__(); self.links=[]; self.current=None
 def handle_starttag(self,tag,attrs):
  if tag=='a': self.current=[dict(attrs).get('href',''),'']
 def handle_data(self,t):
  if self.current is not None: self.current[1]+=t
 def handle_endtag(self,tag):
  if tag=='a' and self.current is not None: self.links.append(self.current); self.current=None
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'SEEDF-study-catalog/1.0'})
 with urllib.request.urlopen(req,timeout=25) as r: html=r.read(4000000).decode('utf-8','replace')
 p=Links();p.feed(html);return [(urllib.parse.urljoin(url,u),t.strip()) for u,t in p.links if u]
def official(u):
 host=urllib.parse.urlparse(u).hostname or ''
 return host=='quadrix.org.br' or host.endswith('.quadrix.org.br')
queue=list(dict.fromkeys(data.get('pending',[])+data['seeds'])); seen=set(); records={x['url']:x for x in data['documents']}; failures=[]
while queue and len(seen)<100:
 u=queue.pop(0)
 if u in seen or not official(u): continue
 seen.add(u)
 try: links=get(u)
 except Exception as e: failures.append({'url':u,'error':str(e)});continue
 for v,t in links:
  if not official(v): continue
  low=t.lower()
  if re.search(r'\.pdf(?:\?|$)',v,re.I) or ('gabarito definitivo' in low or 'caderno de prova' in low):
   if 'gabarito' in low or 'prova' in low or 'caderno' in low:
    records[v]={'url':v,'title':t,'source':u,'kind':'gabarito' if 'gabarito' in low else 'prova','status':'pendente de pareamento e validação'}
  elif re.search(r'/articles/|/collections/|/informacoes/|/concursos/',v) and v not in seen and v not in queue: queue.append(v)
 time.sleep(0.7)
data.update(pending=list(dict.fromkeys(queue+[x['url'] for x in failures])),documents=list(records.values()),lastRun=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),pagesChecked=len(seen),failures=failures)
P.write_text(json.dumps(data,ensure_ascii=False,indent=2))
print('Documentos catalogados:',len(records),'Falhas:',len(failures))
if len(failures)==len(seen): print('ALERTA: nenhuma fonte acessível; fila preservada para nova tentativa')
