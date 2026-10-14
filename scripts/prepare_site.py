"""Copy tracked source into a Site checkout, preserving its native manifest.
--survey makes the protected developer entry the index; public builds exclude
all survey UI assets. This script does not configure or change access controls.
"""
import argparse,pathlib,shutil,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('target',type=pathlib.Path);parser.add_argument('--survey',action='store_true');args=parser.parse_args();target=args.target.resolve()
if target==root or root.is_relative_to(target):raise ValueError('Use a separate Site checkout')
if not (target/'.openai/hosting.json').exists():raise ValueError('Persist native Site hosting.json before preparing')
if (target/'dist').exists():shutil.rmtree(target/'dist')
for name in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0'):
 if not name or name.startswith('.openai/'):continue
 src=root/name;dst=target/name
 if src.is_file():dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
if args.survey:
 shutil.copy2(target/'dist/index.html',target/'dist/game.html')
 shutil.copy2(target/'dist/survey.html',target/'dist/index.html')
 p=target/'dist/survey.mjs';p.write_text(p.read_text().replace("fetch('./index.html')","fetch('./game.html')"))
else:
 for p in (target/'dist').glob('survey*'):p.unlink()
print('Prepared '+('owner-protected developer' if args.survey else 'public game')+' source at '+str(target))
