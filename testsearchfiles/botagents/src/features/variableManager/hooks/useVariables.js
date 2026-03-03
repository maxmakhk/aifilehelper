import { useState } from 'react';
import {
  createVariableDoc,
  deleteVariableDoc,
  fetchVariables,
  updateSignalDoc,
  updateSignalFieldDoc,
  updateVariableDoc,
  removeSignalDoc,
} from '../services/firebase/variablesService';

const useVariables = () => {
  const [variables, setVariables] = useState([]);

  const loadVariables = async () => {
    try {
      const items = await fetchVariables();
      setVariables(items);
    } catch (error) {
      console.error('Error loading variables:', error);
    }
  };

  const listStructure = ({ datalist = [] } = {}) => {
    if (!Array.isArray(datalist)) return [];

    const buildStructurePaths = (obj, prefix = '') => {
      const paths = [];

      if (obj === null || obj === undefined) {
        paths.push(`${prefix}: ${String(obj)}`);
        return paths;
      }

      if (Array.isArray(obj)) {
        obj.forEach((value, index) => {
          const newPrefix = `${prefix}[${index}]`;
          if (value === null || value === undefined) {
            paths.push(`${newPrefix}: ${String(value)}`);
          } else if (typeof value === 'object') {
            paths.push(...buildStructurePaths(value, newPrefix));
          } else {
            paths.push(`${newPrefix}: ${String(value)}`);
          }
        });
        return paths;
      }

      if (typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          if (value === null || value === undefined) {
            paths.push(`${newPrefix}: ${String(value)}`);
          } else if (typeof value === 'object') {
            paths.push(...buildStructurePaths(value, newPrefix));
          } else {
            paths.push(`${newPrefix}: ${String(value)}`);
          }
        });
      } else {
        paths.push(`${prefix}: ${String(obj)}`);
      }

      return paths;
    };

    return datalist.map((item) => {
      const structure = buildStructurePaths(item);
      return { ...item, structure };
    });
  };

  const runFilter = ({ datalist = [], expression = '' } = {}) => {
    try {
      if (!expression || !datalist || !Array.isArray(datalist)) {
        console.log('runFilter: missing expression or empty datalist');
        return [];
      }
      console.log('runFilter called with expression:', expression, '[datalist length] ', datalist.length);

      const trimmedExpr = String(expression).trim();

      // Check if it's a complete arrow function
      const isArrowFunction = true; // /\^\s*\(?\s*datalist\s*\)?\s*=>/.test(trimmedExpr);

      if (isArrowFunction) {
        console.log('Detected complete arrow function', datalist.length);
        try {
          // Execute the arrow function with datalist
          const fn = new Function(`return (${trimmedExpr})`)();
          console.log('function IN', datalist);
          const tempResult = fn(datalist);
          console.log('function OUT', tempResult);

          if (tempResult === undefined) {
            console.warn('Arrow function returned undefined, defaulting to original datalist');
            return datalist.slice();
          }
          // check if tempresult is about remove item
          let result = [];
          if (tempResult.length > 0) {
            if (tempResult[0].remove === true) {
              // run remove item function
              console.log('Detected remove item action in arrow function result', tempResult);
              tempResult.forEach((item) => {
                // find datalist item by id
                datalist.forEach((dItem) => {
                  if (dItem.id === item.id) {
                    // remove item from datalist
                    datalist.splice(datalist.indexOf(dItem), 1);
                  }
                });

                // remove firebase item by item.id
                deleteVariable(item.id);
              });
              result = datalist;
            } else if (tempResult[0].create === true) {
              // run create item function
              console.log('Detected create item action in arrow function result', tempResult);
              tempResult.forEach((item) => {
                // create firebase item by item data
                addVariable({
                  name: item.name || 'Unnamed'
                });
                datalist.push({ name: item.name || 'Unnamed' });
                console.log('Created item from arrow function result', item);
              });
            } else {
              result = datalist;
            }
          } else {
            result = tempResult;
          }

          console.log('Arrow function result length:', result.length, result);
          return Array.isArray(result) ? result : [];
        } catch (e) {
          console.error('Arrow function execution error:', e);
          return [];
        }
      } else {
        console.log('Expression is not a complete arrow function, treating as per-item expression');
      }

      // Heuristic: if the expression references the full list or uses array methods, treat as dataset-level
      const datasetLevelHints = /\bdatalist\b|\.filter\s*\(|\.map\s*\(|\.forEach\s*\(|\.reduce\s*\(|\bfor\s*\(|\bforEach\b/;
      const isDatasetLevel = datasetLevelHints.test(trimmedExpr);

      // Try dataset-level evaluation first when hinted
      if (isDatasetLevel) {
        const wrappers = [
          { name: 'parenthesized return', build: (e) => `return (${e});` },
          { name: 'plain return', build: (e) => `return ${e};` },
          { name: 'raw body (return datalist)', build: (e) => `${e};\nreturn datalist;` },
        ];

        for (const w of wrappers) {
          try {
            const fn = new Function('datalist', w.build(trimmedExpr));
            const result = fn(datalist);
            if (Array.isArray(result)) {
              console.log('runFilter used dataset wrapper:', w.name, 'result length:', result.length);
              return result;
            }
            // boolean true -> return original list, false -> empty
            if (typeof result === 'boolean') {
              return result ? datalist.slice() : [];
            }
          } catch (e) {
            // try next wrapper
          }
        }
        // fallthrough to per-item mode if dataset wrappers fail
      }

      // Per-item evaluation (fallback)
      const perItemWrappers = [
        { name: 'parenthesized return', build: (e) => `with (v || {}) { return (${e}); }` },
        { name: 'plain return', build: (e) => `with (v || {}) { return ${e}; }` },
        { name: 'raw body (return true for statements)', build: (e) => `with (v || {}) { ${e}; return true; }` },
      ];

      let perItemFn = null;
      let usedPerItemWrapper = null;
      for (const w of perItemWrappers) {
        try {
          perItemFn = new Function('v', 'datalist', w.build(trimmedExpr));
          usedPerItemWrapper = w.name;
          break;
        } catch (e) {
          // try next
        }
      }

      if (!perItemFn) {
        console.error('runFilter: failed to build any evaluator for expression:', trimmedExpr);
        return [];
      }

      const filtered = datalist.filter((item) => {
        try {
          const res = perItemFn(item, datalist);
          return res === undefined ? true : Boolean(res);
        } catch (e) {
          console.error('runFilter evaluation error for item', item, e);
          return false;
        }
      });

      console.log('runFilter used per-item wrapper:', usedPerItemWrapper, 'input:', datalist.length, 'filtered:', filtered.length);
      return filtered;
    } catch (err) {
      console.error('runFilter error:', err);
      return [];
    }
  };

  const addVariable = async (variable) => {
    try {
      // Check if variable with same name exists
      const existingVar = variables.find((v) => v.name === variable.name);

      if (existingVar) {
        // Variable exists, check if description is numeric
        const existingDesc = existingVar.description;
        const newDesc = variable.description;

        if (!isNaN(existingDesc) && existingDesc !== '' && !isNaN(newDesc) && newDesc !== '') {
          // Both are numbers, perform calculation
          const existingNum = parseFloat(existingDesc) || 0;
          const newNum = parseFloat(newDesc) || 0;
          const calculatedValue = (existingNum + newNum).toString();

          // Update existing variable; qty should be added
          const addQty = !isNaN(variable.qty) ? Number(variable.qty) : 0;
          const newQty = (existingVar.qty || 0) + addQty;
          const payload = {
            description: calculatedValue,
            qty: newQty,
            tag: variable.tag || existingVar.tag,
            updatedAt: new Date(),
          };
          await updateVariableDoc(existingVar.id, payload);

          setVariables(
            variables.map((v) =>
              v.id === existingVar.id
                ? { ...v, description: calculatedValue, qty: newQty, tag: variable.tag || v.tag, updatedAt: new Date() }
                : v
            )
          );
        } else {
          // Not numeric, just update
          const rawDesc = (variable.description === undefined || variable.description === null) ? '' : variable.description;
          const descToSave = typeof rawDesc === 'object' ? JSON.stringify(rawDesc) : rawDesc;
          const addQty = !isNaN(variable.qty) ? Number(variable.qty) : 0;
          const newQty = (existingVar.qty || 0) + addQty;
          const payload = {
            description: descToSave,
            qty: newQty,
            tag: variable.tag || existingVar.tag,
            updatedAt: new Date(),
          };
          await updateVariableDoc(existingVar.id, payload);

          setVariables(
            variables.map((v) =>
              v.id === existingVar.id
                ? { ...v, description: descToSave, qty: newQty, tag: variable.tag || v.tag, updatedAt: new Date() }
                : v
            )
          );
        }
      } else {
        // Variable doesn't exist, create new
        const rawDescNew = (variable.description === undefined || variable.description === null) ? '' : variable.description;
        const descToSaveNew = typeof rawDescNew === 'object' ? JSON.stringify(rawDescNew) : rawDescNew;
        const docRef = await createVariableDoc({
          name: variable.name,
          description: descToSaveNew,
          qty: variable.qty || 0,
          tag: variable.tag || [],
          createdAt: new Date(),
        });
        setVariables([...variables, { id: docRef.id, ...variable, description: descToSaveNew }]);
      }
    } catch (error) {
      console.error('Error adding variable:', error);
    }
  };

  const updateVariable = async (id, newVariable) => {
    console.log('updateVariable called with id:', id, 'newVariable:', newVariable);
    try {
      const existingVar = variables.find((v) => v.id === id);
      if (!existingVar) {
        console.error('Variable not found');
        return;
      }

      const existingDesc = existingVar.description;
      const newDesc = newVariable.description;

      let finalDescription = newDesc;

      // Check if both descriptions are numeric
      if (!isNaN(existingDesc) && existingDesc !== '' && !isNaN(newDesc) && newDesc !== '') {
        // Both are numbers, perform calculation
        const existingNum = parseFloat(existingDesc) || 0;
        const newNum = parseFloat(newDesc) || 0;
        finalDescription = (existingNum + newNum).toString();
      }

      // Handle qty: replace existing qty when updating (not delta)
      let finalQty = existingVar.qty !== undefined ? existingVar.qty : 0;
      if (newVariable.qty !== undefined) {
        const q = Number(newVariable.qty);
        finalQty = !isNaN(q) ? q : finalQty;
      }

      const descToSave = typeof finalDescription === 'object' ? JSON.stringify(finalDescription) : finalDescription;
      await updateVariableDoc(id, {
        name: newVariable.name,
        description: descToSave,
        tag: newVariable.tag || [],
        qty: finalQty,
        updatedAt: new Date(),
      });
      setVariables(
        variables.map((v) => (v.id === id ? { id, name: newVariable.name, description: descToSave, tag: newVariable.tag, qty: finalQty } : v))
      );
    } catch (error) {
      console.error('Error updating variable:', error);
    }
  };

  const deleteVariable = async (id) => {
    try {
      await deleteVariableDoc(id);
      setVariables(variables.filter((v) => v.id !== id));
    } catch (error) {
      console.error('Error deleting variable:', error);
    }
  };

  const syncVariablesFromDatalist = async (datalist = []) => {
    try {
      if (!Array.isArray(datalist)) return;

      const byId = new Map((variables || []).map((v) => [v.id, v]));
      const byName = new Map((variables || []).map((v) => [v.name, v]));

      for (const item of datalist) {
        if (!item) continue;

        const rawDesc = (item.description === undefined || item.description === null) ? '' : item.description;
        const descToSave = typeof rawDesc === 'object' ? JSON.stringify(rawDesc) : rawDesc;
        const payload = {
          name: item.name || '',
          description: descToSave,
          qty: item.qty !== undefined ? item.qty : 0,
          tag: Array.isArray(item.tag) ? item.tag : [],
          updatedAt: new Date(),
        };

        if (!payload.name) continue;

        let existing = null;
        if (item.id && byId.has(item.id)) {
          existing = byId.get(item.id);
        } else if (item.name && byName.has(item.name)) {
          existing = byName.get(item.name);
        }

        if (existing && existing.id) {
          await updateVariableDoc(existing.id, payload);
        } else {
          await createVariableDoc({
            ...payload,
            createdAt: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('Error syncing variables from datalist:', error);
    }
  };

  const setSignalForItem = async (itemName, signalName, template = {}) => {
    try {
      if (!itemName || !signalName) return;
      // find variable by name
      const existing = variables.find((v) => v.name === itemName);
      if (!existing) {
        console.warn('Variable not found for setSignalForItem:', itemName);
        return;
      }
      const normalizedSignal = {
        ...(template || {}),
        lastUpdatedAt: template?.lastUpdatedAt || new Date(),
      };

      await updateSignalDoc(existing.id, signalName, {
        ...normalizedSignal,
        lastUpdatedAt: template?.lastUpdatedAt || new Date(),
      });

      setVariables((vars) =>
        vars.map((v) =>
          v.id === existing.id
            ? {
                ...v,
                signal: {
                  ...(v.signal || {}),
                  [signalName]: {
                    ...(template || {}),
                    lastUpdatedAt: template?.lastUpdatedAt || new Date(),
                  },
                },
                updatedAt: new Date(),
              }
            : v
        )
      );
    } catch (error) {
      console.error('Error setting signal for item:', error);
    }
  };

  const updateSignalField = async (itemId, signalName, fieldName, value) => {
    try {
      const itemName = itemId; // accept itemName (compat: param named itemId previously)
      if (!itemName || !signalName || !fieldName) return;
      const existing = variables.find((v) => v.name === itemName || v.id === itemName);
      if (!existing) return;
      await updateSignalFieldDoc(existing.id, signalName, fieldName, value);

      setVariables((vars) =>
        vars.map((v) => {
          if (v.id !== existing.id) return v;
          const existingSignal = v.signal || {};
          const signalEntry = existingSignal[signalName] || {};
          return {
            ...v,
            signal: {
              ...existingSignal,
              [signalName]: {
                ...signalEntry,
                [fieldName]: value,
                lastUpdatedAt: new Date(),
              },
            },
            updatedAt: new Date(),
          };
        })
      );
    } catch (error) {
      console.error('Error updating signal field:', error);
    }
  };

  const removeSignalFromItem = async (itemId, signalName) => {
    try {
      const itemName = itemId; // accept itemName
      if (!itemName || !signalName) return;
      const existing = variables.find((v) => v.name === itemName || v.id === itemName);
      if (!existing) return;
      await removeSignalDoc(existing.id, signalName);

      setVariables((vars) =>
        vars.map((v) => {
          if (v.id !== existing.id) return v;
          const nextSignal = { ...(v.signal || {}) };
          delete nextSignal[signalName];
          return { ...v, signal: nextSignal, updatedAt: new Date() };
        })
      );
    } catch (error) {
      console.error('Error removing signal from item:', error);
    }
  };

  return {
    variables,
    addVariable,
    updateVariable,
    deleteVariable,
    loadVariables,
    syncVariablesFromDatalist,
    setSignalForItem,
    updateSignalField,
    removeSignalFromItem,
    runFilter,
    listStructure,
  };
};

export default useVariables;
