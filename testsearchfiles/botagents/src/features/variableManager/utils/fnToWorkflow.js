/**
 * fnToWorkflow: Convert function string to workflow nodes/edges
 * 
 * NEW DESIGN: Conditions on edges (no diamond nodes)
 * - if/elseif/else branches become parallel linear blocks
 * - Each branch's condition becomes the edge label from previous tail
 * - Pure action chains + conditionally-labeled edges = cleaner diagram
 */
export default function fnToWorkflow(fnString) {
  const trimBody = (code) => code.replace(/^.*?\{/, "").replace(/\}[^}]*$/, "").trim();

  const normalizeLines = (body) => {
    let processed = body.replace(/console\.log\s*\([^;]+\);?/g, (match) => `__LOG__${match}__ENDLOG__`);
    processed = processed.replace(/return\s*\{\s*next\s*:\s*["'`]([^"'`]+)["'`]\s*\}\s*;?/g, (match) => match.replace(/\{/g, '⟨').replace(/\}/g, '⟩'));
    processed = processed.replace(/}\s*else\s+if/g, '\nelse if').replace(/}\s*else\s*{/g, '\nelse {').replace(/}\s*else\s*$/g, '\nelse');
    processed = processed.replace(/(if\s*\([^)]+\))\s*\{/g, '$1\n{').replace(/(else\s+if\s*\([^)]+\))\s*\{/g, '$1\n{').replace(/(else)\s*\{/g, '$1\n{');
    processed = processed.replace(/\{/g, '\n{\n').replace(/\}/g, '\n}\n');
    processed = processed.replace(/⟨/g, '{').replace(/⟩/g, '}');
    processed = processed.replace(/__LOG__(.*?)__ENDLOG__/g, '$1');
    return processed.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  };

  const logRegex = /^console\.log\((['"`])((?:(?!\1).)*)\1\)\s*;?$/;
  const requestAPIRegex = /^__LOG__console\.log\s*\(\s*['"`]requestAPI['"`]\s*,\s*['"`]([^\"'`]+)['"`]\s*,\s*['"`]([^\"'`]+)['"`].*$/;
  const assignRegex = /^(const|let)\s+(\w+)\s*=\s*([^;]+);?/;
  const ifRegex = /^if\s*\((.*?)\)\s*\{?\s*$/;
  const elseIfRegex = /^else\s+if\s*\((.*?)\)\s*\{?\s*$/;
  const elseRegex = /^else\s*\{?\s*$/;
  const returnNextRegex = /^return\s+\{\s*next\s*:\s*['"`]([^\"'`]+)['"`]\s*\}\s*;?$/;
  const returnRegex = /^return\s+(.*);?$/;

  function readBlock(lines, index) {
    let depth = 0;
    const block = [];
    let i = index;
    if (lines[i] === "{") { depth = 1; i++; }
    while (i < lines.length && depth > 0) {
      const line = lines[i];
      if (line === "{") { depth++; }
      else if (line === "}") { depth--; if (depth === 0) { i++; break; } }
      else { block.push(line); }
      i++;
    }
    return { block, nextIndex: i };
  }

  function parseBlock(lines, startIndex = 0) {
    const stmts = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (assignRegex.test(line)) {
        const m = line.match(assignRegex);
        const varName = m[2];
        const value = m[3].trim();
        stmts.push({ kind: 'assign', text: line, varName, value });
        i++; continue;
      }
      if (returnNextRegex.test(line)) {
        const m = line.match(returnNextRegex);
        const next = m[1].trim();
        stmts.push({ kind: 'returnNext', text: line, next }); i++; continue;
      }
      if (requestAPIRegex.test(line)) {
        const m = line.match(requestAPIRegex);
        const apiName = m[1];
        const apiUrl = m[2];
        let checkVarName = null;
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (assignRegex.test(nextLine)) {
            const nextMatch = nextLine.match(assignRegex);
            checkVarName = nextMatch[2];
          }
        }
        stmts.push({ kind: 'requestAPI', text: line, apiName, apiUrl, apiParams: m[3] || '{}', storeLocation: m[4] || '', message: `Request ${m[1]}`, checkVarName });
        i++; continue;
      }
      if (logRegex.test(line)) { const m = line.match(logRegex); const message = m[2]; stmts.push({ kind: 'log', text: line, message }); i++; continue; }
      if (returnRegex.test(line)) { const m = line.match(returnRegex); const value = m[1].trim(); stmts.push({ kind: 'return', text: line, value }); i++; continue; }
      if (ifRegex.test(line)) {
        const chain = { kind: 'ifChain', branches: [], text: line };
        const ifMatch = line.match(ifRegex);
        chain.branches.push({ kind: 'if', condition: ifMatch[1].trim(), body: [] });
        let blk = readBlock(lines, i + 1);
        chain.branches[0].body = parseBlock(blk.block, 0);
        i = blk.nextIndex;
        while (i < lines.length) {
          const l = lines[i];
          if (elseIfRegex.test(l)) {
            const m = l.match(elseIfRegex);
            const cond = m[1].trim();
            const branch = { kind: 'elseIf', condition: cond, body: [], text: l };
            blk = readBlock(lines, i + 1); branch.body = parseBlock(blk.block, 0); chain.branches.push(branch); i = blk.nextIndex; continue;
          }
          if (elseRegex.test(l)) {
            const branch = { kind: 'else', body: [], text: l }; blk = readBlock(lines, i + 1); branch.body = parseBlock(blk.block, 0); chain.branches.push(branch); i = blk.nextIndex; continue;
          }
          break;
        }
        stmts.push(chain); continue;
      }
      i++;
    }
    return stmts;
  }

  /**
   * NEW: Parse ifChain into conditionalLinear blocks (no separate condition node)
   * Each branch becomes a linear block with its condition attached
   */
  function toLevelBlocks(topStmts) {
    const levels = []; 
    let currentLinear = [];
    const flushLinear = () => { 
      if (currentLinear.length > 0) { 
        levels.push({ type: 'linear', stmts: currentLinear }); 
        currentLinear = []; 
      } 
    };
    
    for (const stmt of topStmts) {
      if (stmt.kind === 'ifChain') { 
        flushLinear(); 
        // Each branch becomes a conditionalLinear block (parallel execution paths)
        for (const branch of stmt.branches) {
          const condition = branch.condition || 'else';
          levels.push({ 
            type: 'conditionalLinear', 
            condition, 
            stmts: branch.body 
          });
        }
      } else { 
        currentLinear.push(stmt); 
      }
    }
    flushLinear(); 
    
    console.log('[fnToWorkflow] levelBlocks:', JSON.stringify(levels, null, 2));
    return levels;
  }

  /**
   * NEW: Build flow with conditions on edges (no diamond nodes)
   * - conditionalLinear blocks: fan-out from previous tails with edge.label = condition
   * - Fan-in: collect all branch tails for next block
   */
  function levelBlocksToFlow(levelBlocks) {
    let nextTempId = 1; 
    const tempNodes = []; 
    const tempEdges = [];
    
    const newTempNode = (type, label, extra = {}) => { 
      const id = `T${nextTempId++}`; 
      tempNodes.push({ id, type, label, ...extra }); 
      return id; 
    };
    
    const newTempEdge = (source, target, label) => { 
      tempEdges.push({ source, target, label: label || '' }); 
    };
    
    const startId = newTempNode('start', 'start'); 
    let currentTails = [{ tailId: startId, nextLabel: null }];
    
    // Group consecutive conditionalLinear blocks (they're parallel branches)
    const groupedBlocks = [];
    let i = 0;
    while (i < levelBlocks.length) {
      const block = levelBlocks[i];
      if (block.type === 'conditionalLinear') {
        const group = [];
        while (i < levelBlocks.length && levelBlocks[i].type === 'conditionalLinear') {
          group.push(levelBlocks[i]);
          i++;
        }
        groupedBlocks.push({ type: 'conditionalGroup', branches: group });
      } else {
        groupedBlocks.push(block);
        i++;
      }
    }
    
    for (const block of groupedBlocks) {
      let blockTails = [];
      
      if (block.type === 'linear') {
        // Standard linear block (unchanged logic)
        let prevId = null;
        for (const stmt of block.stmts) {
          let label;
          if (stmt.kind === 'assign') { 
            label = `${stmt.varName} = ${stmt.value.replace(/["']/g, '')}`; 
          } else if (stmt.kind === 'requestAPI') { 
            label = `${stmt.apiName}`; 
            const id = newTempNode('api', label, { apiUrl: stmt.apiUrl }); 
            if (prevId) { 
              newTempEdge(prevId, id); 
            } else { 
              for (const tail of currentTails) { 
                newTempEdge(tail.tailId, id, tail.nextLabel); 
              } 
            } 
            prevId = id; 
            continue; 
          } else if (stmt.kind === 'log') { 
            label = stmt.message; 
          } else if (stmt.kind === 'returnNext') { 
            label = `return next:${stmt.next}`; 
          } else if (stmt.kind === 'return') { 
            label = `return ${stmt.value}`; 
          } else { 
            continue; 
          }
          
          const id = newTempNode(stmt.kind === 'requestAPI' ? 'api' : 'action', label);
          if (prevId) { 
            newTempEdge(prevId, id); 
          } else { 
            for (const tail of currentTails) { 
              newTempEdge(tail.tailId, id, tail.nextLabel); 
            } 
          }
          prevId = id;
        }
        
        if (prevId) blockTails = [{ tailId: prevId, nextLabel: null }]; 
        else blockTails = currentTails.map((t) => ({ ...t }));
        
      } else if (block.type === 'conditionalGroup') {
        // NEW: Fan-out to each branch with condition on edge
        for (const branch of block.branches) {
          const condition = branch.condition; // e.g., "var_a===true", "else"
          let prevId = null; 
          let pendingNext = null;
          
          for (const stmt of branch.stmts) {
            if (stmt.kind === 'returnNext') { 
              pendingNext = stmt.next; 
              continue; 
            }
            
            let nodeLabel; 
            let nodeType = 'action';
            
            if (stmt.kind === 'assign') { 
              nodeLabel = `${stmt.varName} = ${stmt.value.replace(/["']/g, '')}`; 
            } else if (stmt.kind === 'requestAPI') { 
              nodeLabel = `${stmt.apiName}`; 
              nodeType = 'api'; 
              const id = newTempNode(nodeType, nodeLabel, { apiUrl: stmt.apiUrl }); 
              
              if (prevId) { 
                newTempEdge(prevId, id); 
              } else { 
                // First node in branch: fan-out from ALL previous tails with condition label
                for (const tail of currentTails) {
                  newTempEdge(tail.tailId, id, condition);
                }
              } 
              prevId = id; 
              continue; 
            } else if (stmt.kind === 'log') { 
              nodeLabel = stmt.message; 
            } else if (stmt.kind === 'return') { 
              nodeLabel = `return ${stmt.value}`; 
            } else { 
              continue; 
            }
            
            const id = newTempNode(nodeType, nodeLabel);
            
            if (prevId) { 
              newTempEdge(prevId, id); 
            } else { 
              // First node in branch: fan-out from ALL previous tails with condition label
              for (const tail of currentTails) {
                newTempEdge(tail.tailId, id, condition);
              }
            }
            prevId = id;
          }
          
          // Collect tail from this branch (may be null if empty branch)
          if (prevId) {
            blockTails.push({ tailId: prevId, nextLabel: pendingNext });
          } else {
            // Empty branch: previous tails pass through with condition label
            for (const tail of currentTails) {
              blockTails.push({ tailId: tail.tailId, nextLabel: pendingNext });
            }
          }
        }
      }
      
      currentTails = blockTails;
    }
    
    // Wire end node
    const endId = newTempNode('end', 'end');
    const labelToNodeId = {};
    
    for (const n of tempNodes) {
      if (n.label) {
        labelToNodeId[n.label] = n.id;
      }
    }
    
    for (const t of currentTails) {
      const { tailId, nextLabel } = t; 
      if (!tailId) continue;
      
      if (nextLabel) {
        let targetId = labelToNodeId[nextLabel];
        if (targetId) { 
          newTempEdge(tailId, targetId, 'next'); 
        } else if (nextLabel === 'end') { 
          newTempEdge(tailId, endId, 'next'); 
        } else { 
          newTempEdge(tailId, endId); 
        }
      } else { 
        newTempEdge(tailId, endId); 
      }
    }
    
    return { tempNodes, tempEdges };
  }

  function materializeFlow(tempNodes, tempEdges) {
    const nodes = []; 
    const edges = []; 
    let idx = 1; 
    const idMap = {};
    
    for (const t of tempNodes) {
      const id = String(idx++); 
      idMap[t.id] = id;
      const type = t.type === 'start' ? 'start' 
                 : t.type === 'end' ? 'end' 
                 : t.type === 'api' ? 'api' 
                 : 'action';
      
      const nodeData = { id, type, position: { x: 250, y: idx * 80 } };
      
      if (t.type === 'api') {
        nodeData.data = { label: t.label, apiLabel: true, apiUrl: t.apiUrl };
        nodeData.className = 'api-node'; 
        nodeData.style = { 
          background: '#e8f4f8', 
          border: '2px solid #17a2b8', 
          borderRadius: '8px', 
          padding: '12px', 
          fontWeight: '600', 
          color: '#0c5460' 
        };
      } else {
        nodeData.data = { label: t.label };
      }
      
      nodes.push(nodeData);
    }

    let eIdx = 1;
    for (const e of tempEdges) {
      const source = idMap[e.source]; 
      const target = idMap[e.target]; 
      if (!source || !target) continue;
      
      const edge = { 
        id: `e${eIdx++}`, 
        source, 
        target, 
        type: 'smoothstep' 
      };
      
      if (e.label) edge.label = e.label; 
      edges.push(edge);
    }
    
    return { nodes, edges };
  }

  const body = trimBody(fnString);
  const lines = normalizeLines(body);
  const topStmts = parseBlock(lines);
  const levelBlocks = toLevelBlocks(topStmts);
  const { tempNodes, tempEdges } = levelBlocksToFlow(levelBlocks);
  const { nodes, edges } = materializeFlow(tempNodes, tempEdges);
  
  return { levelBlocks, nodes, edges, fnString };
}
