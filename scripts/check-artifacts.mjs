#!/usr/bin/env node
// Gate de artefatos: verifica que PRD, specs, contratos, estado e relatórios batem entre si.
// Uso: node scripts/check-artifacts.mjs [--final]
//   --final  exige também todas as features "done" com relatório aprovado (use antes da entrega).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const FINAL = process.argv.includes('--final');
const errors = [];
const warn = [];
const fail = (m) => errors.push(m);
const read = (p) => readFileSync(p, 'utf8');

// ---------- PRD ----------
const prd = read('docs/prd.md');
const features = [...prd.matchAll(/^\| (F\d{2}) \| [^|]+\|/gm)].map((m) => m[1]);
const uniqueFeatures = [...new Set(features)];
if (uniqueFeatures.length < 5) fail(`PRD: precisa de pelo menos 5 features (achei ${uniqueFeatures.length})`);
if (!/^## \d*\.?\s*Fora de escopo/im.test(prd)) fail('PRD: falta a seção "Fora de escopo"');

const waveRows = [...prd.matchAll(/^\| \**(W\d+)\** \| \**([^|]+?)\** \|/gm)];
if (!waveRows.some((r) => (r[2].match(/F\d{2}/g) || []).length >= 2)) fail('PRD: nenhuma wave com 2+ features');

// critérios: linhas com **F01-AC01** ou **X01**
const criteriaLines = prd.split('\n').filter((l) => /\*\*(F\d{2}-AC\d{2}|X\d{2})\*\*/.test(l));
const criteria = criteriaLines.map((l) => {
  const id = l.match(/\*\*(F\d{2}-AC\d{2}|X\d{2})\*\*/)[1];
  return { id, line: l, rules: l.match(/R\d{2}/g) || [] };
});
const ruleSet = new Set(criteria.flatMap((c) => c.rules));
for (let i = 1; i <= 13; i++) {
  const r = `R${String(i).padStart(2, '0')}`;
  if (!ruleSet.has(r)) fail(`PRD: a regra ${r} não é citada em nenhum critério`);
}

// grafo (mermaid "A --> B") e critério cross por aresta
const edges = [...prd.matchAll(/^\s*(F\d{2})\s*-->\s*(F\d{2})\s*$/gm)].map((m) => [m[1], m[2]]);
if (edges.length === 0) fail('PRD: grafo de dependências não encontrado');
const crossCriteria = criteria.filter((c) => c.id.startsWith('X'));
for (const [a, b] of edges) {
  const has = crossCriteria.some((c) => new RegExp(`${a}\\s*→\\s*${b}`).test(c.line));
  if (!has) fail(`PRD: a aresta ${a} → ${b} não tem critério cross-feature`);
}

// ---------- pastas de feature ----------
const featDirs = existsSync('docs/features') ? readdirSync('docs/features') : [];
const dirOf = (f) => featDirs.find((d) => d.startsWith(f + '-'));
const contracts = {};
for (const f of uniqueFeatures) {
  const d = dirOf(f);
  if (!d) { fail(`${f}: pasta docs/features/${f}-* não existe`); continue; }
  for (const file of ['spec.md', 'plan.md', 'contract.md']) {
    if (!existsSync(join('docs/features', d, file))) fail(`${f}: falta ${file}`);
  }
  const cpath = join('docs/features', d, 'contract.md');
  contracts[f] = existsSync(cpath) ? read(cpath) : '';
  const mapIdx = contracts[f].search(/^## Mapeamento/m);
  if (mapIdx < 0) fail(`${f}: contrato sem seção "## Mapeamento"`);
  contracts[f] = { full: contracts[f], map: mapIdx >= 0 ? contracts[f].slice(mapIdx) : '' };
}

// cada critério da feature mapeado no contrato dela; cada X em pelo menos um contrato
for (const c of criteria) {
  if (c.id.startsWith('F')) {
    const f = c.id.slice(0, 3);
    if (!contracts[f]?.map.includes(c.id)) fail(`${c.id}: não aparece no mapeamento do contrato de ${f}`);
  } else if (!Object.values(contracts).some((k) => k.map.includes(c.id))) {
    fail(`${c.id}: critério cross-feature não aparece no mapeamento de nenhum contrato`);
  }
}
// itens citados no mapeamento existem na tabela de itens
for (const [f, k] of Object.entries(contracts)) {
  const declared = new Set([...k.full.matchAll(/^\| (C\d{2}) \|/gm)].map((m) => m[1]));
  for (const ref of new Set(k.map.match(/C\d{2}/g) || [])) {
    if (!declared.has(ref)) fail(`${f}: mapeamento cita ${ref}, que não existe na tabela de itens`);
  }
}

// ---------- estado ----------
let state = null;
try { state = JSON.parse(read('docs/state.json')); } catch (e) { fail(`docs/state.json inválido: ${e.message}`); }
if (state) {
  for (const f of uniqueFeatures) {
    const s = state.features?.[f];
    if (!s) { fail(`state.json: falta a feature ${f}`); continue; }
    if (s.latestReport && !existsSync(s.latestReport)) fail(`state.json: ${f}.latestReport aponta para arquivo inexistente (${s.latestReport})`);
    if (s.status === 'done' && !s.latestReport) fail(`state.json: ${f} está done sem latestReport`);
    if (FINAL && s.status !== 'done') fail(`state.json: ${f} não está done (${s.status})`);
    if (s.latestReport && existsSync(s.latestReport)) {
      const rep = read(s.latestReport);
      if (s.status === 'done' && !/Veredito final:\s*\**APROVADO/i.test(rep)) fail(`${f}: status done, mas o relatório mais recente não está APROVADO`);
      // o mais recente de verdade = maior nome (prefixo de data/hora)
      const dir = join('docs/features', dirOf(f), 'reports');
      const all = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).sort() : [];
      if (all.length && !s.latestReport.endsWith(all[all.length - 1])) fail(`state.json: ${f}.latestReport não é o relatório mais recente (${all[all.length - 1]})`);
    }
  }
}

// ---------- relatórios ----------
let gitOk = true;
try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' }); } catch { gitOk = false; warn.push('fora de um repositório git: imutabilidade dos relatórios não verificada'); }
for (const f of uniqueFeatures) {
  const d = dirOf(f);
  if (!d) continue;
  const dir = join('docs/features', d, 'reports');
  if (!existsSync(dir)) continue;
  for (const n of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const p = join(dir, n);
    const rep = read(p);
    for (const field of ['Data:', 'Commit avaliado:', 'Ferramenta:', 'Modelo:', 'Veredito final:']) {
      if (!rep.includes(field)) fail(`${p}: falta o campo "${field}"`);
    }
    if (gitOk) {
      const commits = execFileSync('git', ['log', '--format=%h', '--', p], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      if (commits.length > 1) fail(`${p}: relatório alterado depois de commitado (${commits.length} commits) — crie um relatório novo em vez de editar`);
    }
  }
}

// ---------- saída ----------
for (const w of warn) console.log(`  aviso: ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`  FAIL ${e}`);
  console.log(`Artefatos: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log(`Artefatos OK: ${uniqueFeatures.length} features, ${criteria.length} critérios, ${edges.length} arestas, R01–R13 cobertas${FINAL ? ', todas as features done' : ''}.`);
