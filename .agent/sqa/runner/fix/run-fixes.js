// Minimal fix-stage entry point: reads the QA report and lists what needs fixing.
// The full per-issue fix-agent orchestration is specified in agents/fix-agents.md.
const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '..', '..', 'results', 'report.json');
if (!fs.existsSync(reportPath)) {
  console.error('No results/report.json — run `npm run sqa` first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Playwright's JSON report nests specs under suites; collect the failed ones.
const failed = [];
const walk = (suites = []) => {
  for (const s of suites) {
    for (const spec of s.specs || []) {
      const ok = (spec.tests || []).every(t =>
        (t.results || []).every(r => r.status === 'passed' || r.status === 'skipped')
      );
      if (!ok) failed.push(`${s.title} › ${spec.title}`);
    }
    walk(s.suites);
  }
};
walk(report.suites);

if (failed.length === 0) {
  console.log('✅ No failing checks — nothing to fix.');
  process.exit(0);
}

console.log(`❌ ${failed.length} failing check(s):`);
failed.forEach(t => console.log('   - ' + t));
console.log('\nEach failing check has a screenshot under results/. Hand them to the');
console.log('fix agents per agents/fix-agents.md: repair the root cause, then re-run');
console.log('ONLY that check to confirm it goes green before moving on.');
