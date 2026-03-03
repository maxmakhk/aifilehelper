// server/systemPromptGenerator.js
// Standalone generator for system prompts, usable on both server and client if needed.

function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim());
  if (typeof raw === 'string') return raw.split(',').map((t) => t.trim());
  return [];
}

function generateSystemPrompt({ userPrompt = '', functionsList = [], apis = [] } = {}) {
  try {
    const physicalObjects = [];
    const seenObjectIds = new Set();

    if (Array.isArray(functionsList)) {
      functionsList.forEach((rule) => {
        try {
          let wf = rule.workflowObject;
          if (!wf) return;
          if (typeof wf === 'string') {
            try {
              wf = JSON.parse(wf);
            } catch (e) {
              // ignore parse errors
              return;
            }
          }
          if (!Array.isArray(wf.nodes)) return;

          wf.nodes.forEach((node) => {
            const apiName = node.metadata?.apiName;
            if (!apiName) return;

            let latestComponent = null;
            if (Array.isArray(apis)) {
              const apiNameLower = String(apiName).toLowerCase();
              latestComponent = apis.find((api) => (api.name || '').toLowerCase() === apiNameLower);
            }

            let tags = [];
            if (latestComponent && latestComponent.tags) {
              tags = normalizeTags(latestComponent.tags);
            } else {
              tags = normalizeTags(node.metadata?.tags || []);
            }

            if (tags.some((tag) => tag.toLowerCase() === 'object')) {
              const uniqueKey = `${String(node.id)}_${String(apiName)}`;
              if (!seenObjectIds.has(uniqueKey)) {
                seenObjectIds.add(uniqueKey);
                const finalName = latestComponent?.name || apiName;
                const finalDescription = latestComponent?.description || node.description || node.data?.description || '';
                const finalTags = tags;
                physicalObjects.push({
                  name: finalName,
                  id: node.id,
                  apiName: apiName,
                  description: finalDescription,
                  tags: finalTags,
                });
              }
            }
          });
        } catch (err) {
          // continue on error
        }
      });
    }

    const physicalObjectTags = new Set();
    physicalObjects.forEach((obj) => {
      const tags = obj.tags || [];
      tags.forEach((tag) => {
        if (tag.toLowerCase() !== 'object') {
          physicalObjectTags.add(tag.toLowerCase());
        }
      });
    });

    const actionComponents = [];
    if (Array.isArray(apis)) {
      apis.forEach((api) => {
        const tagsArray = normalizeTags(api.tags);
        const lowerTags = tagsArray.map((t) => String(t).toLowerCase());
        const hasOpen = lowerTags.includes('open');
        const hasAction = lowerTags.includes('action');
        const matchingTags = tagsArray.filter(
          (tag) =>
            physicalObjectTags.has(String(tag).toLowerCase()) &&
            String(tag).toLowerCase() !== 'action' &&
            String(tag).toLowerCase() !== 'open'
        );
        const shouldInclude = hasOpen || (hasAction && matchingTags.length > 0);
        if (shouldInclude) {
          actionComponents.push({
            name: api.name || 'Unknown',
            id: api.id || '',
            description: api.description || '',
            matchingTags: matchingTags,
            isOpen: hasOpen,
            isAction: hasAction,
          });
        }
      });
    }

    let output = '';
    output += 'Physically Objects:\n';
    physicalObjects.forEach((obj) => {
      output += `${obj.name}, ${obj.id}, ${obj.description}\n`;
    });
    output += '\nAction Components:\n';
    actionComponents.forEach((comp) => {
      output += `${comp.name}, ${comp.id}, ${comp.description}`;
      const tags = [];
      if (Array.isArray(comp.matchingTags) && comp.matchingTags.length) {
        tags.push(`matchingTags: ${comp.matchingTags.join('|')}`);
      }
      if (comp.isOpen) tags.push('open');
      if (comp.isAction) tags.push('action');
      if (tags.length > 0) output += `, [${tags.join(', ')}]`;
      output += '\n';
    });

    const systemPrompt = `it is a industry lab
if you have phycisly object here:
${output}
base on user prompt, to create a workflow, as a array format as below:
const nodes = [
 {id: "node1", action:"CameraInput",value:""},
 {id: "node2", action:"worldPosition",value:""},
 {id: "node3", action:"wait",value:2000}
]
const edges = [
  {source: "node1", target: "node2", label: "next"},
  {source: "node2", target: "node3", label: "next"},
  {source: "node3", target: "node1", label: "repeat"},
]`;

    return { userPrompt: userPrompt || '', systemPrompt, physicalObjects, actionComponents };
  } catch (err) {
    console.error('generateSystemPrompt error', err);
    return { userPrompt: userPrompt || '', systemPrompt: '', physicalObjects: [], actionComponents: [] };
  }
}

export { generateSystemPrompt };
