import os

base_dir = '../web-toys-hypo-A'

# 1. Update playwright.config.ts
playwright_file = os.path.join(base_dir, 'playwright.config.ts')
with open(playwright_file, 'r') as f:
    content = f.read()
content = content.replace('5174', '5175')
with open(playwright_file, 'w') as f:
    f.write(content)

# 2. Expose state in simulation.ts
sim_file = os.path.join(base_dir, 'ants-nest-simulator/src/simulation.ts')
with open(sim_file, 'r') as f:
    content = f.read()

if '(window as any).__state = state;' not in content:
    content = content.replace("import { state } from './state';", "import { state } from './state';\n(window as any).__state = state;")
    with open(sim_file, 'w') as f:
        f.write(content)

# 3. Update tests/ant-nest-long-run.spec.ts to use proper checkpoints
test_file = os.path.join(base_dir, 'tests/ant-nest-long-run.spec.ts')
with open(test_file, 'r') as f:
    content = f.read()
content = content.replace('const targetSteps = [10000, 50000, 100000, 200000, 300000];', 'const targetSteps = [30000, 60000, 120000, 200000, 300000];')
with open(test_file, 'w') as f:
    f.write(content)
