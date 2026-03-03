export default function applyPrefixToIds(parsedFlow) {
  const nodePrefix = Math.random().toString(36).slice(2, 8) + '_';
  if (!parsedFlow) return parsedFlow;
  if (Array.isArray(parsedFlow.edges)) {
    for (let i in parsedFlow.edges) {
      parsedFlow.edges[i].id = nodePrefix + parsedFlow.edges[i].id;
      parsedFlow.edges[i].source = nodePrefix + parsedFlow.edges[i].source;
      parsedFlow.edges[i].target = nodePrefix + parsedFlow.edges[i].target;
    }
  }
  if (Array.isArray(parsedFlow.nodes)) {
    for (let i in parsedFlow.nodes) {
      parsedFlow.nodes[i].id = nodePrefix + parsedFlow.nodes[i].id;
    }
  }
  return parsedFlow;
}
