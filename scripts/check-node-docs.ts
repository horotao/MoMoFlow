import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { isMain, projectRoot } from './quality.ts';

export function checkNodeDocs(root: string): string[] {
  const source = ts.createSourceFile('index.ts', readFileSync(resolve(root, 'src/nodes/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const registered: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'nodeTypes' && node.initializer) {
      let value = node.initializer;
      while (ts.isSatisfiesExpression(value) || ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
      if (!ts.isObjectLiteralExpression(value)) throw new Error('nodeTypes 必须为可检查的对象注册表。');
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) {
          throw new Error('发现无法识别的节点注册项，请同步更新文档检查器。');
        }
        registered.push(property.name.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!registered.length) throw new Error('未找到 nodeTypes，不能确认节点文档完整性。');
  const documentPath = resolve(root, 'src/nodes/README.md');
  const markdown = readFileSync(documentPath, 'utf8');
  const documented = [...markdown.matchAll(/^\|[^\n|]+\|\s*`([^`]+)`\s*\|/gm)].map(match => match[1]);
  const errors = [
    ...registered.filter(name => !documented.includes(name)).map(name => `README 缺少已注册节点：${name}`),
    ...documented.filter(name => !registered.includes(name)).map(name => `README 包含未注册节点：${name}`),
    ...documented.filter((name, index) => documented.indexOf(name) !== index).map(name => `README 节点重复：${name}`),
  ];
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split('#')[0]);
    if (!existsSync(resolve(dirname(documentPath), target))) errors.push(`README 本地链接失效：${link}`);
  }
  return errors;
}

if (isMain(import.meta.url)) {
  try {
    const errors = checkNodeDocs(projectRoot);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('节点注册表、README 索引与本地链接一致。');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
