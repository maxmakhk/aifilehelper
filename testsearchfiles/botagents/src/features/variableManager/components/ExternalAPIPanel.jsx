import React, { useState, useMemo, useEffect } from 'react';

const ExternalAPIPanel = ({
  newApiName,
  setNewApiName,
  newApiUrl,
  setNewApiUrl,
  addApi,
  apis = [],
  setApis,
  apisLoading,
  deleteApi,
  selectedApiId,
  setSelectedApiId,
  testInput,
  setTestInput,
  testing,
  testApi,
  testResult,
  saveApiPrompt,
  updateApiMetadata,
  setAiWarning
}) => {
  const [newApiTags, setNewApiTags] = useState('');
  const [newApiFunction, setNewApiFunction] = useState('');
  const [newApiDescription, setNewApiDescription] = useState('');
  const [newApiCss, setNewApiCss] = useState('');
  const [editingApiId, setEditingApiId] = useState(null);
  const [searchTags, setSearchTags] = useState('');
  const [expandedApiId, setExpandedApiId] = useState(null);
  const [functionEditModal, setFunctionEditModal] = useState(null); // {apiId, tempFunction}
  const [uploadFiles, setUploadFiles] = useState({});
  const [uploadPreviews, setUploadPreviews] = useState({});
  const [uploadingIds, setUploadingIds] = useState({});
  const [uploadStatus, setUploadStatus] = useState({}); // 'idle' | 'uploading' | 'success' | 'error'

  useEffect(() => {
    return () => {
      Object.values(uploadPreviews).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) { /* ignore */ }
      });
    };
  }, [uploadPreviews]);

  const filteredApis = useMemo(() => {
    if (!searchTags.trim()) return apis;
    const searchTerms = searchTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    return apis.filter(api => {
      const apiTags = Array.isArray(api.tags) ? api.tags : (api.tags || '').split(',').map(t => t.trim().toLowerCase());
      return searchTerms.some(term => apiTags.some(tag => tag.includes(term)));
    });
  }, [apis, searchTags]);

  const handleAddApi = async () => {
    if (!newApiName.trim()) {
      setAiWarning('Name is required');
      setTimeout(() => setAiWarning(''), 2000);
      return;
    }
    // POST URL is optional; if empty pass an empty string
    await addApi(newApiName.trim(), (newApiUrl || '').trim(), newApiTags, newApiFunction, newApiCss, newApiDescription);
    setNewApiTags('');
    setNewApiFunction('');
    setNewApiDescription('');
    setNewApiCss('');
  };

  const handleUpdateApi = async (apiId) => {
    const api = apis.find(a => a.id === apiId);
    if (!api) return;
    try {
      const updatePayload = {
        name: api.name,
        url: api.url,
        function: api.function || '',
        description: api.description || ''
      };
      // Convert tags to array if it's a string
      if (api.tags !== undefined) {
        if (typeof api.tags === 'string') {
          updatePayload.tags = api.tags.split(',').map(t => t.trim()).filter(Boolean);
        } else {
          updatePayload.tags = api.tags;
        }
      }
      // include css style inside metadata
      const css = api.cssStyle !== undefined ? api.cssStyle : (api.metadata && api.metadata.cssStyle ? api.metadata.cssStyle : '');
      updatePayload.metadata = { ...(api.metadata || {}), cssStyle: css };
      await updateApiMetadata(apiId, updatePayload);
      setEditingApiId(null);
      setAiWarning('API updated successfully');
      setTimeout(() => setAiWarning(''), 2000);
    } catch (err) {
      console.error('Error updating API:', err);
      setAiWarning('Failed to update API');
      setTimeout(() => setAiWarning(''), 2000);
    }
  };

  const handleEditField = (apiId, field, value) => {
    setApis((s) => s.map((a) => (a.id === apiId ? { ...a, [field]: value } : a)));
  };

  const openFunctionEditor = (apiId) => {
    const api = apis.find(a => a.id === apiId);
    if (api) setFunctionEditModal({ apiId, tempFunction: api.function || '' });
  };
  const closeFunctionEditor = () => setFunctionEditModal(null);

  const saveFunctionEdit = async () => {
    if (!functionEditModal) return;
    const { apiId, tempFunction } = functionEditModal;
    handleEditField(apiId, 'function', tempFunction);
    try {
      const api = apis.find(a => a.id === apiId);
      if (api) {
        const updatePayload = { name: api.name, url: api.url, function: tempFunction };
        if (api.tags !== undefined) updatePayload.tags = api.tags;
        await updateApiMetadata(apiId, updatePayload);
        setAiWarning('Function saved successfully');
        setTimeout(() => setAiWarning(''), 2000);
      }
    } catch (err) {
      console.error('Error saving function:', err);
      setAiWarning('Failed to save function');
      setTimeout(() => setAiWarning(''), 2000);
    }
    closeFunctionEditor();
  };

  const insertFunctionTemplate = () => {
    const template = `async function processRequest(input) {\n  // Extract data from input\n  const { prompt, data } = input;\n  \n  // Add your custom logic here\n  const result = {\n    status: 'success',\n    message: 'Request processed',\n    input: prompt || data,\n    timestamp: new Date().toISOString(),\n    // Add your response data here\n    output: null\n  };\n  \n  return result;\n}`;
    if (functionEditModal) setFunctionEditModal({ ...functionEditModal, tempFunction: template });
  };

  const testFunctionInModal = async () => {
    if (!functionEditModal) return;
    const code = functionEditModal.tempFunction || '';
    console.log('--- Function test start ---');
    try {
      let fn = null;
      // provide a minimal ctx for functions to use (setVar/getVar)
      const _ctx_store = {};
      const ctx = {
        setVar: (k, v) => { _ctx_store[k] = v; console.log('ctx.setVar', k, v); },
        getVar: (k) => _ctx_store[k],
        _dump: () => ({ ..._ctx_store }),
      };

      // Try as a function expression: (input) => {...} or async function expression
      try {
        // Wrap in parentheses so function expressions parse
        // eslint-disable-next-line no-eval
        fn = eval('(' + code + ')');
      } catch (e) {
        // ignore
      }

      // If not a function yet, try evaluating code that defines a named function like processRequest
      if (typeof fn !== 'function') {
        try {
          // eslint-disable-next-line no-eval
          eval(code);
          // eslint-disable-next-line no-undef
          if (typeof processRequest === 'function') fn = processRequest;
        } catch (e) {
          // ignore
        }
      }

      if (typeof fn !== 'function') {
        throw new Error('No callable function found. Define a function expression or a named function `processRequest`.');
      }

      // Call the function with a sample payload. The function can reference `ctx` from this scope.
      const maybePromise = fn({ prompt: 'test', data: {} });
      const result = await Promise.resolve(maybePromise);
      console.log('Function returned:', result);
      console.log('ctx store after run:', ctx._dump());
      console.log('--- Function test end ---');
      setAiWarning('Function test completed (see console)');
      setTimeout(() => setAiWarning(''), 2000);
      return result;
    } catch (err) {
      console.error('Function test error:', err);
      setAiWarning('Function test error: ' + (err.message || err));
      setTimeout(() => setAiWarning(''), 3000);
    }
  };

  return (
    <div className="external-api" style={{ padding: 16, background: '#111827', borderRadius: '0 0 8px 8px' }}>
      {/* Add New API Section */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 12px 0' }}>Add New API</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="API name"
            value={newApiName}
            onChange={(e) => setNewApiName(e.target.value)}
            style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', minWidth: 150 }}
          />
          <input
            type="text"
            placeholder="Tags (comma-separated)"
            value={newApiTags}
            onChange={(e) => setNewApiTags(e.target.value)}
            style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', minWidth: 180 }}
          />
          <button className="btn-primary" onClick={handleAddApi} disabled={!newApiName.trim()}>
            Add API
          </button>
        </div>
        <textarea
          placeholder="Function definition (optional - describe API function or paste JS code)"
          value={newApiFunction}
          onChange={(e) => setNewApiFunction(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: 8 }}
        />
        <textarea
          placeholder="Component description (optional - describe what this component does)"
          value={newApiDescription}
          onChange={(e) => setNewApiDescription(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', fontFamily: 'inherit', fontSize: '0.85rem', marginBottom: 8 }}
        />
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: '0.85rem', color: '#9ca3af', display: 'block', marginBottom: 6 }}>CSS Style (applies to nodes representing this API)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              placeholder=".api-node { background: #fff; color: #000; }"
              value={newApiCss}
              onChange={(e) => setNewApiCss(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <button className="btn-secondary" onClick={() => {
              const tpl = `/* Example API node CSS */\n.api-node {\n  background: linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%);\n  color: #fff;\n  border-radius: 6px;\n  padding: 8px;\n}`;
              setNewApiCss(tpl);
            }} style={{ whiteSpace: 'nowrap' }}>Insert CSS Template</button>
          </div>
        </div>
      </div>

      {/* Search by Tags */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="🔍 Search by tags (comma-separated)"
          value={searchTags}
          onChange={(e) => setSearchTags(e.target.value)}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #475569', background: '#020617', color: '#e5e7eb' }}
        />
      </div>

      {/* Saved Components List */}
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>Saved Components ({filteredApis.length})</h4>
        {apisLoading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredApis.map((a) => (
              <div key={a.id} style={{ background: '#020617', borderRadius: 6, overflow: 'hidden' }}>
                {/* Main API Item */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', cursor: 'pointer', marginBottom: 4 }} onClick={() => { setSelectedApiId(a.id); setTestInput(a.lastPrompt || ''); }}>
                      {editingApiId === a.id ? (
                        <input
                          type="text"
                          value={a.name}
                          onChange={(e) => handleEditField(a.id, 'name', e.target.value)}
                          style={{ padding: 4, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', width: '100%' }}
                        />
                      ) : a.name}
                    </div>
                    {/* Description */}
                    <div style={{ marginBottom: 4 }}>
                      {editingApiId === a.id ? (
                        <textarea
                          value={a.description || ''}
                          onChange={(e) => handleEditField(a.id, 'description', e.target.value)}
                          placeholder="Component description and purpose"
                          rows={2}
                          style={{ padding: 4, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', width: '100%', fontFamily: 'inherit', fontSize: '0.80rem', resize: 'vertical' }}
                        />
                      ) : (
                        a.description && (
                          <div style={{ fontSize: '0.80rem', color: '#d1d5db', fontStyle: 'italic', paddingLeft: 0 }}>
                            📝 {a.description}
                          </div>
                        )
                      )}
                    </div>

                    {/* Tags Display and Edit */}
                    <div style={{ fontSize: '0.75rem', marginBottom: 4 }}>
                      {editingApiId === a.id ? (
                        <input
                          type="text"
                          placeholder="Tags (comma-separated)"
                          value={Array.isArray(a.tags) ? a.tags.join(', ') : a.tags || ''}
                          onChange={(e) => handleEditField(a.id, 'tags', e.target.value)}
                          style={{ padding: 4, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', width: '100%' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          {Array.isArray(a.tags) && a.tags.length > 0 ? (
                            a.tags.map((tag, idx) => (
                              <span key={idx} style={{ background: '#1e40af', color: '#e5e7eb', padding: '2px 6px', borderRadius: 3, fontSize: '0.75rem' }}>
                                #{tag.trim()}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>No tags</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Upload Image - Only in Edit Mode */}
                    {editingApiId === a.id && (
                      <div style={{ marginTop: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 6 }}>Upload Component Image</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setUploadFiles(s => ({ ...s, [a.id]: file }));
                              setUploadStatus(s => ({ ...s, [a.id]: 'idle' }));
                              setUploadPreviews(s => {
                                const next = { ...s };
                                if (next[a.id]) {
                                  try {
                                    URL.revokeObjectURL(next[a.id]);
                                  } catch (err) { /* ignore */ }
                                }
                                if (file) {
                                  next[a.id] = URL.createObjectURL(file);
                                } else {
                                  delete next[a.id];
                                }
                                return next;
                              });
                            }}
                            disabled={uploadStatus[a.id] === 'uploading' || uploadingIds[a.id]}
                          />
                          <button
                            className="btn-primary"
                            onClick={async () => {
                              const file = uploadFiles[a.id];
                              if (!file) {
                                setAiWarning('Please select a file to upload');
                                setTimeout(() => setAiWarning(''), 2000);
                                return;
                              }
                              try {
                                setUploadingIds(s => ({ ...s, [a.id]: true }));
                                setUploadStatus(s => ({ ...s, [a.id]: 'uploading' }));
                                const form = new FormData();
                                form.append('file', file);
                                const res = await fetch('https://maxsolo.co.uk/images/upload.php', {
                                  method: 'POST',
                                  body: form
                                });
                                const json = await res.json();
                                console.log('Upload response', json);
                                if (json?.status === 'success' && json.new_name) {
                                  const imageName = json.url;
                                  try {
                                    await updateApiMetadata(a.id, { metadata: { image: imageName } });
                                    setUploadStatus(s => ({ ...s, [a.id]: 'success' }));
                                    setTimeout(() => setUploadStatus(s => ({ ...s, [a.id]: 'idle' })), 3000);
                                  } catch (err) {
                                    console.error('Failed to save image name to firestore', err);
                                    setUploadStatus(s => ({ ...s, [a.id]: 'error' }));
                                    setAiWarning('Uploaded but failed to save metadata');
                                    setTimeout(() => setAiWarning(''), 2000);
                                  }
                                  setApis(s => s.map(item => item.id === a.id ? { ...item, metadata: { ...(item.metadata || {}), image: imageName } } : item));
                                  setUploadFiles(s => ({ ...s, [a.id]: null }));
                                  setUploadPreviews(s => {
                                    const next = { ...s };
                                    if (next[a.id]) {
                                      try {
                                        URL.revokeObjectURL(next[a.id]);
                                      } catch (err) { /* ignore */ }
                                      delete next[a.id];
                                    }
                                    return next;
                                  });
                                  setAiWarning('Image uploaded and saved');
                                  setTimeout(() => setAiWarning(''), 2000);
                                } else {
                                  console.error('Upload response', json);
                                  setUploadStatus(s => ({ ...s, [a.id]: 'error' }));
                                  setAiWarning('Upload failed');
                                  setTimeout(() => setAiWarning(''), 2000);
                                }
                              } catch (err) {
                                console.error('Upload error', err);
                                setUploadStatus(s => ({ ...s, [a.id]: 'error' }));
                                setAiWarning('Upload failed: ' + (err.message || err));
                                setTimeout(() => setAiWarning(''), 2000);
                              } finally {
                                setUploadingIds(s => ({ ...s, [a.id]: false }));
                              }
                            }}
                            disabled={uploadStatus[a.id] === 'uploading' || uploadingIds[a.id]}
                            style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                          >
                            {uploadStatus[a.id] === 'uploading' || uploadingIds[a.id] ? 'Uploading...' : 'Upload'}
                          </button>
                          <div style={{ minWidth: 120, fontSize: '0.85rem' }}>
                            {uploadStatus[a.id] === 'uploading' && <span style={{ color: '#f59e0b' }}>⏳ Uploading...</span>}
                            {uploadStatus[a.id] === 'success' && <span style={{ color: '#10b981' }}>✅ Saved</span>}
                            {uploadStatus[a.id] === 'error' && <span style={{ color: '#ef4444' }}>❌ Failed</span>}
                            {!uploadStatus[a.id] && a.metadata?.image && (
                              <span style={{ color: '#9ca3af' }}>Current: {a.metadata.image.split('/').pop()}</span>
                            )}
                          </div>
                          {(uploadPreviews[a.id] || a.metadata?.image) && (
                            <img
                              src={uploadPreviews[a.id] || a.metadata?.image}
                              alt="Component preview"
                              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #334155' }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Component Size - Only in Edit Mode */}
                    {editingApiId === a.id && (
                      <div style={{ marginTop: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 6 }}>
                          Component Size (ratio format: width:height)
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 8 }}>
                            Examples: 1:1 (64x64px), 2:1 (128x64px), 3:1 (192x64px), 2:2 (128x128px)
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="2:1"
                            value={a.metadata?.size || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setApis(s => s.map(item => item.id === a.id ? { ...item, metadata: { ...(item.metadata || {}), size: value } } : item));
                            }}
                            style={{ 
                              padding: '6px 8px', 
                              borderRadius: 4, 
                              border: '1px solid #475569', 
                              background: '#111827', 
                              color: '#e5e7eb',
                              width: '120px',
                              fontSize: '0.85rem'
                            }}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            {['1:1', '2:1', '3:1', '2:2', '4:1', '3:2'].map(preset => (
                              <button
                                key={preset}
                                className="btn-secondary"
                                onClick={() => {
                                  setApis(s => s.map(item => item.id === a.id ? { ...item, metadata: { ...(item.metadata || {}), size: preset } } : item));
                                }}
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          {a.metadata?.size && (
                            <span style={{ fontSize: '0.80rem', color: '#9ca3af' }}>
                              {(() => {
                                const [w, h] = (a.metadata.size || '2:1').split(':').map(n => parseInt(n) || 1);
                                return `${w * 64}×${h * 64}px`;
                              })()}
                            </span>
                          )}
                        </div>

                        {/* Function Definition - moved into edit form */}
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 6 }}>Function Definition:</div>
                          <textarea
                            value={a.function || ''}
                            onChange={(e) => handleEditField(a.id, 'function', e.target.value)}
                            rows={4}
                            placeholder="Function definition or JS code"
                            style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.80rem' }}
                          />
                        </div>

                        {/* CSS Style - moved into edit form */}
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 6 }}>CSS Style (applies to node display)</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <textarea
                              value={a.cssStyle !== undefined ? a.cssStyle : (a.metadata?.cssStyle || '')}
                              onChange={(e) => handleEditField(a.id, 'cssStyle', e.target.value)}
                              rows={3}
                              placeholder=".api-node { background: #fff; }"
                              style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.80rem' }}
                            />
                            <button className="btn-secondary" onClick={() => {
                              const tpl = `/* Node CSS template */\n.api-node {\n  background: linear-gradient(90deg,#06b6d4,#6366f1);\n  color: white;\n  border-radius:6px;\n  padding:6px;\n}`;
                              handleEditField(a.id, 'cssStyle', tpl);
                            }}>Insert CSS Template</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => { setSelectedApiId(a.id); setTestInput(a.lastPrompt || ''); testApi(a, a.lastPrompt || testInput); }}
                      disabled={testing}
                      style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                    >
                      Test
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => openFunctionEditor(a.id)}
                      title="Edit API function definition"
                      style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                    >
                      fn()
                    </button>
                    <button
                      className={editingApiId === a.id ? 'btn-primary' : 'btn-secondary'}
                      onClick={() => {
                        if (editingApiId === a.id) {
                          handleUpdateApi(a.id);
                        } else {
                          setEditingApiId(a.id);
                        }
                      }}
                      style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                    >
                      {editingApiId === a.id ? 'Save' : 'Edit'}
                    </button>
                    {editingApiId === a.id && (
                      <button
                        className="btn-cancel"
                        onClick={() => setEditingApiId(null)}
                        style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                      >
                        Cancel
                      </button>
                    )}
                    <button className="btn-cancel" onClick={() => deleteApi(a.id)} style={{ fontSize: '0.85rem', padding: '4px 8px' }}>
                      Delete
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setExpandedApiId(expandedApiId === a.id ? null : a.id)}
                      style={{ fontSize: '0.85rem', padding: '4px 8px' }}
                    >
                      {expandedApiId === a.id ? '▼' : '▶'} Details
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedApiId === a.id && (
                  <div style={{ borderTop: '1px solid #475569', padding: 8, background: '#0f172a' }}>
                    {/* Description in Expanded Details */}
                    {editingApiId === a.id && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 4 }}>Description (Component Purpose):</div>
                        <textarea
                          value={a.description || ''}
                          onChange={(e) => handleEditField(a.id, 'description', e.target.value)}
                          rows={2}
                          placeholder="Describe what this component does"
                          style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', fontFamily: 'inherit', fontSize: '0.80rem', resize: 'vertical' }}
                        />
                      </div>
                    )}

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 4 }}>Function Definition:</div>
                      {editingApiId === a.id ? (
                        <textarea
                          value={a.function || ''}
                          onChange={(e) => handleEditField(a.id, 'function', e.target.value)}
                          rows={4}
                          placeholder="Function definition or JS code"
                          style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.80rem' }}
                        />
                      ) : (
                        <pre style={{ background: '#111827', padding: 8, borderRadius: 4, overflow: 'auto', fontSize: '0.80rem', color: '#9ca3af', margin: 0 }}>
                          {a.function || '(No function defined)'}
                        </pre>
                      )}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: 6 }}>CSS Style (applies to node display)</div>
                      {editingApiId === a.id ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <textarea
                            value={a.cssStyle !== undefined ? a.cssStyle : (a.metadata?.cssStyle || '')}
                            onChange={(e) => handleEditField(a.id, 'cssStyle', e.target.value)}
                            rows={3}
                            placeholder=".api-node { background: #fff; }"
                            style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#111827', color: '#e5e7eb', fontFamily: 'monospace', fontSize: '0.80rem' }}
                          />
                          <button className="btn-secondary" onClick={() => {
                            const tpl = `/* Node CSS template */\n.api-node {\n  background: linear-gradient(90deg,#06b6d4,#6366f1);\n  color: white;\n  border-radius:6px;\n  padding:6px;\n}`;
                            handleEditField(a.id, 'cssStyle', tpl);
                          }}>Insert CSS Template</button>
                        </div>
                      ) : (
                        <pre style={{ background: '#0b1220', padding: 8, borderRadius: 4, overflow: 'auto', fontSize: '0.80rem', color: '#9ca3af', margin: 0 }}>{a.metadata?.cssStyle || '(No CSS defined)'}</pre>
                      )}
                    </div>

                    <div style={{ fontSize: '0.80rem', color: '#6b7280' }}>
                      Created: {new Date(a.createdAt?.toDate?.() || a.createdAt).toLocaleString()}
                      {a.updatedAt && <div>Updated: {new Date(a.updatedAt?.toDate?.() || a.updatedAt).toLocaleString()}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!filteredApis.length && <div style={{ color: '#6b7280' }}>
              {apis.length > 0 ? 'No APIs match the search tags.' : 'No APIs saved yet.'}
            </div>}
          </div>
        )}
      </div>

      {/* Function Editor Modal */}
      {functionEditModal && (
        <div 
        id="function-edit-modal"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#111827',
            borderRadius: 8,
            border: '1px solid #475569',
            maxWidth: '90vw',
            width: '800px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: 16,
              borderBottom: '1px solid #475569',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, color: '#e5e7eb' }}>
                Edit API Function
              </h3>
              <button
                onClick={closeFunctionEditor}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>

            {/* Body - Editor */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                    Function Definition (JavaScript or plain text description)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={insertFunctionTemplate}
                      className="btn-secondary"
                      title="Insert a function template"
                      style={{ fontSize: '0.80rem', padding: '4px 12px' }}
                    >
                      📋 Insert Template
                    </button>
                    <button
                      onClick={testFunctionInModal}
                      className="btn-secondary"
                      title="Run the function once and log result to console"
                      style={{ fontSize: '0.80rem', padding: '4px 12px' }}
                    >
                      ▶ Test Function
                    </button>
                  </div>
                </div>
                <textarea
                  value={functionEditModal.tempFunction}
                  onChange={(e) => setFunctionEditModal({ ...functionEditModal, tempFunction: e.target.value })}
                  placeholder={`Define your API function here. Examples:\n\n// JavaScript async function:\nasync function processData(input) {\n  return { result: input.trim().toUpperCase() };\n}\n\n// Or describe the function:\nProcesses JSON payload and returns transformed data.`}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: '#e5e7eb',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                    minHeight: '300px',
                    lineHeight: 1.5
                  }}
                />
              </div>

              {/* Info */}
              <div style={{
                background: '#0f172a',
                padding: 12,
                borderRadius: 6,
                fontSize: '0.8rem',
                color: '#9ca3af',
                marginTop: 12
              }}>
                <strong>Tips:</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                  <li>You can paste entire JavaScript function code</li>
                  <li>You can also write plain English descriptions</li>
                  <li>Use this with fnString nodes for custom logic</li>
                  <li>Function will be stored in the API metadata</li>
                </ul>
              </div>
            </div>

            {/* Footer - Buttons */}
            <div style={{
              padding: 16,
              borderTop: '1px solid #475569',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={closeFunctionEditor}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={saveFunctionEdit}
                className="btn-primary"
              >
                Save Function
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternalAPIPanel;
