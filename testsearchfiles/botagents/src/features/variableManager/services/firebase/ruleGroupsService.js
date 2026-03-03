import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

/**
 * Load rule groups from Firestore
 */
export async function loadRuleGroups(db) {
  try {
    const q = query(collection(db, 'VariableManager-ruleGroups'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const arr = [];
    
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    
    return arr;
  } catch (err) {
    console.error('Error loading rule groups:', err);
    throw err;
  }
}

/**
 * Save or update a rule group
 */
export async function saveRuleGroup(db, { groupId, name, rules }) {
  try {
    if (groupId) {
      await updateDoc(doc(db, 'VariableManager-ruleGroups', groupId), {
        name,
        rules,
        updatedAt: new Date(),
      });
    } else {
      await addDoc(collection(db, 'VariableManager-ruleGroups'), {
        name,
        rules,
        createdAt: new Date(),
      });
    }
  } catch (err) {
    console.error('Error saving rule group:', err);
    throw err;
  }
}

/**
 * Delete a rule group
 */
export async function deleteRuleGroup(db, id) {
  try {
    await deleteDoc(doc(db, 'VariableManager-ruleGroups', id));
  } catch (err) {
    console.error('Error deleting group:', err);
    throw err;
  }
}

/**
 * Resolve a rule reference to an actual expression
 */
export function resolveRuleExpression(rule, { functionsList, rulePrompts, ruleSource }) {
  if (!rule) return null;

  // If it's a function index reference
  if (typeof rule.funcIndex === 'number' && functionsList && functionsList[rule.funcIndex]) {
    return functionsList[rule.funcIndex].expr || '';
  }

  // If it's an inline expression
  if (rule.expr) {
    return rule.expr;
  }

  return null;
}
