import os

test_file = '../web-toys-hypo-A/tests/ant-nest-long-run.spec.ts'
with open(test_file, 'r') as f:
    content = f.read()

# Modify to also print the max pheromone value
content = content.replace(
    'return { hist, varX, varY, stdX: Math.sqrt(varX), stdY: Math.sqrt(varY) };',
    'let maxPh = 0;\n      for (const layer of state.pheromone) { for (let i = 0; i < layer.length; i++) { if (layer[i] > maxPh) maxPh = layer[i]; } }\n      return { hist, varX, varY, stdX: Math.sqrt(varX), stdY: Math.sqrt(varY), maxPh };'
)
content = content.replace(
    'console.log(`Pheromone Histogram: ${JSON.stringify(stats.hist)}`);',
    'console.log(`Pheromone Histogram: ${JSON.stringify(stats.hist)} (Max: ${stats.maxPh.toFixed(4)})`);'
)

with open(test_file, 'w') as f:
    f.write(content)
