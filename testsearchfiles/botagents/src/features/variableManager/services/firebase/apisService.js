import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Load external APIs from Firestore
 */
export async function loadApis(db) {
  try {
    const q = query(collection(db, 'VariableManager-apis'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return items;
  } catch (err) {
    console.error('Error loading APIs:', err);
    throw err;
  }
}

/**
 * Add a new external API
 */
export async function addApi(db, { name, url, tags = [], function: fn = '', cssStyle = '', description = '' }) {
  try {
    const docRef = await addDoc(collection(db, 'VariableManager-apis'), {
      name,
      url,
      description: description || '',
      tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean),
      function: fn || '',
      metadata: { cssStyle: cssStyle || '' },
      lastPrompt: '',
      createdAt: new Date(),
    });
    return {
      id: docRef.id,
      name,
      url,
      description: description || '',
      tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean),
      function: fn || '',
      metadata: { cssStyle: cssStyle || '' },
      lastPrompt: '',
      createdAt: new Date(),
    };
  } catch (err) {
    console.error('Error adding API:', err);
    throw err;
  }
}

/**
 * Delete an external API
 */
export async function deleteApi(db, id) {
  try {
    await deleteDoc(doc(db, 'VariableManager-apis', id));
  } catch (err) {
    console.error('Error deleting API:', err);
    throw err;
  }
}

/**
 * Save/update the last prompt for an API
 */
export async function saveApiPrompt(db, apiId, prompt) {
  try {
    const apiRef = doc(db, 'VariableManager-apis', apiId);
    await updateDoc(apiRef, {
      lastPrompt: prompt,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Error saving API prompt:', err);
    throw err;
  }
}

/**
 * Update API metadata (tags, function, etc)
 */
export async function updateApiMetadata(db, apiId, metadata) {
  try {
    const apiRef = doc(db, 'VariableManager-apis', apiId);
    const updateData = { ...metadata, updatedAt: serverTimestamp() };
    
    // Remove undefined values - Firestore doesn't allow them
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    // Normalize tags to array
    if (updateData.tags && typeof updateData.tags === 'string') {
      updateData.tags = updateData.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    
    await updateDoc(apiRef, updateData);
  } catch (err) {
    console.error('Error updating API metadata:', err);
    throw err;
  }
}

/**
 * Test an external API with a prompt
 */
export async function testApi(api, prompt) {
  if (!api || !api.url) {
    throw new Error('Invalid API configuration');
  }

  try {
    const resp = await fetch(api.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const text = await resp.text();
    let parsed = null;
    let parseError = null;

    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parseError = 'non-json response';
    }

    return {
      ok: resp.ok,
      status: resp.status,
      text,
      parsed,
      parseError,
      warning: resp.ok ? null : `HTTP ${resp.status}`,
    };
  } catch (err) {
    console.error('Test API error:', err);
    throw err;
  }
}
