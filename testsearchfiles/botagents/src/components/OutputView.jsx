import React, { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import "../App.css";

export default function OutputView({ onClose, socket, projectId }) {
  // create 4 default dialogue icons positioned around the 512x512 canvas
  const createIcons = () => {
    return [
      /*
      {
        id: 1,
        x: 130,
        y: 95,
        name: "Camera1",
        type: "read",
        connectedComponent: "CameraInput",
        bindVar: "visionaiData.camera1",
        labelTemplate: "{{status}}",
        dialogTemplate: "Camera1: {{message}}",
      },
      {
        id: 2,
        x: 173,
        y: 162,
        name: "Machine1",
        type: "read",
        connectedComponent: "CameraInput",
        bindVar: "visionaiData.Machine1",
        labelTemplate: "{{status}}",
        dialogTemplate: "Machine1: {{message}}",
      },
      {
        id: 3,
        x: 351,
        y: 204,
        name: "Monitor",
        type: "read",
        connectedComponent: "CameraInput",
        bindVar: "visionaiData.Monitor",
        labelTemplate: "{{status}}",
        dialogTemplate: "Monitor: {{message}}",
      },
      {
        id: 4,
        x: 328,
        y: 341,
        name: "EngineerA",
        type: "thinking",
        connectedComponent: "CameraInput",
        bindVar: "visionaiData.EngineerA",
        labelTemplate: "{{status}}",
        dialogTemplate: "EngineerA: {{message}}",
      },
      */
    ];
  };

  const [icons, setIcons] = useState(createIcons);
  const iconsRef = useRef(icons);
  
  // Keep ref in sync with state
  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  const draggingRef = useRef(null);
  const movedRef = useRef({});

  const onPointerDownIcon = (e, icon) => {
    e.stopPropagation();
    const pointerId = e.pointerId;
    e.currentTarget.setPointerCapture(pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    draggingRef.current = { id: icon.id, startX, startY, initX: icon.x, initY: icon.y, pointerId };
    movedRef.current[icon.id] = false;
  };

  const onPointerMoveIcon = (e, icon) => {
    if (!draggingRef.current || draggingRef.current.id !== icon.id) return;
    const { startX, startY, initX, initY } = draggingRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newX = Math.round(initX + dx);
    const newY = Math.round(initY + dy);
    // clamp inside 0..(512-48)
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const clampedX = clamp(newX, 0, 512 - 48);
    const clampedY = clamp(newY, 0, 512 - 48);
    setIcons((prev) => prev.map((it) => (it.id === icon.id ? { ...it, x: clampedX, y: clampedY } : it)));
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current[icon.id] = true;
  };

  const onPointerUpIcon = (e, icon) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    draggingRef.current = null;
    // small timeout to allow click event to read movedRef
    setTimeout(() => {
      movedRef.current[icon.id] = false;
    }, 0);
    // log current icon positions so user can copy defaults
    try {
      console.log(
        "dialogue icon positions:",
        JSON.stringify(icons.map((i) => ({ id: i.id, x: i.x, y: i.y, name: i.name })), null, 2)
      );
    } catch (err) {
      console.log("dialogue icon positions:", icons);
    }
  };

  const onClickIcon = (icon) => {
    // ignore clicks that were part of a drag
    if (movedRef.current[icon.id]) return;
    const name = window.prompt("Enter name for this icon:", icon.name || "");
    if (name !== null) {
      setIcons((prev) => prev.map((it) => (it.id === icon.id ? { ...it, name } : it)));
    }
  };

  const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const pickStatusFor = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("camera")) {
      const opts = [
        `Idle`,
        `Capturing`,
        `Capturing frame #${getRandomInt(1, 999)}`,
        `Idle / every ${getRandomInt(5, 15)}s, capturing`,
      ];
      return opts[getRandomInt(0, opts.length - 1)];
    }
    if (n.includes("machine")) {
      const temp = getRandomInt(60, 90);
      const pressure = getRandomInt(900, 1100);
      const opts = [
        `Running...`,
        `Temperature ${temp}°C`,
        `Pressure ${pressure} mBar`,
        `Running... / Temp ${temp}°C / Pressure ${pressure}mBar`,
      ];
      return opts[getRandomInt(0, opts.length - 1)];
    }
    if (n.includes("monitor")) {
      const opts = [`System Normal running`, `System idle...`, `No issues detected`];
      return opts[getRandomInt(0, opts.length - 1)];
    }
    if (n.includes("engineer") || n.includes("eng")) {
      const opts = [`I am monitoring the system`, `Checking sensors...`, `All systems nominal`];
      return opts[getRandomInt(0, opts.length - 1)];
    }
    // generic
    const opts = ["Active", "Idle", "OK", "Working...", "Waiting..."];
    return opts[getRandomInt(0, opts.length - 1)];
  };

  // removed demo tick; OutputView will use globalStoreVars instead

  // processRequest: resolves templates in createIcons against storeVars
  async function processRequest({ storeVars = {}, createIconsParam = null } = {}) {
    const normalize = (k) => String(k || "").trim().toLowerCase().replace(/\./g, "_");

    const normalizedVars = {};
    for (const key of Object.keys(storeVars || {})) {
      normalizedVars[normalize(key)] = storeVars[key];
    }

    const resolveTemplate = (tpl) => {
      if (!tpl || typeof tpl !== "string") return "";
      return tpl.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawKey) => {
        const k = normalize(rawKey);
        if (Object.prototype.hasOwnProperty.call(normalizedVars, k)) {
          const v = normalizedVars[k];
          return v === undefined || v === null ? "" : String(v);
        }
        return "";
      });
    };

    const baseIcons = Array.isArray(createIconsParam) ? createIconsParam : createIcons();
    const updatedIcons = baseIcons.map((ic) => {
      const labelTpl = ic.labelTemplate || ic.label || "";
      // allow per-icon override variables: outputviewdialogue1..4
      const overrideKey = `outputviewdialogue${ic.id}`;
      const hasOverride = Object.prototype.hasOwnProperty.call(normalizedVars, overrideKey);
      const overrideVal = hasOverride ? normalizedVars[overrideKey] : null;

      // Resolve new values
      const dialogueLine1 = resolveTemplate(labelTpl) || ic.name || "";
      let dialogueLine2 = "";
      
      // Only update dialogueLine2 if we have an override value
      // Otherwise preserve existing value (like StoreVarsFloating - keep latest value, no defaults)
      if (hasOverride && overrideVal != null) {
        dialogueLine2 = String(overrideVal);
      } else {
        // Preserve existing dialogueLine2 if present
        dialogueLine2 = ic.dialogueLine2 || "";
      }

      return { ...ic, dialogueLine1, dialogueLine2 };
    });

    const dialogues = updatedIcons.slice(0, 4).map((ic) => {
      const lines = [];
      if (ic.dialogueLine1) lines.push(ic.dialogueLine1);
      if (ic.dialogueLine2) lines.push(ic.dialogueLine2);
      return lines.join("\n");
    });

    return { updatedIcons, dialogues, normalizedVars };
  }

  // subscribe to server storeVars updates via socket or poll /api/projects/:projectId/state every 5s
  useEffect(() => {
    let pollInterval = null;

    const handleStoreVarsPayload = async (payload) => {
      try {
        const pid = payload?.projectId || payload?.project || null;
        if (projectId) {
          if (pid && pid !== projectId) return; // ignore other projects
        } else {
          // if OutputView has no projectId prop, only accept payloads without projectId
            if (pid) return;
          }
          // Merge globalStoreVars (if present) with local storeVars.
          // Local storeVars should override globals when keys conflict.
          const globalSv = payload && payload.globalStoreVars ? payload.globalStoreVars : {};
          const localSv = payload && payload.storeVars ? payload.storeVars : (payload || {});
          const mergedSv = { ...(globalSv || {}), ...(localSv || {}) };
          // Use iconsRef to get current icons without adding dependency
          const { updatedIcons } = await processRequest({ storeVars: mergedSv, createIconsParam: iconsRef.current });
          setIcons(updatedIcons);
      } catch (e) {
        console.warn('processRequest failed', e);
      }
    };

    if (socket && socket.on) {
      socket.on('store_vars_update', handleStoreVarsPayload);
      // execution_state may include { storeVars, globalStoreVars, projectId }
      socket.on('execution_state', (d) => handleStoreVarsPayload(d));
      // listen for global store updates specifically so OutputView stays in sync
      socket.on('global_store_vars_update', (d) => {
        try {
          // payload may be { projectId, globalStoreVars } or the globalStoreVars object directly
          if (!d) return;
          const payload = (d && d.globalStoreVars) ? { projectId: d.projectId, globalStoreVars: d.globalStoreVars } : { globalStoreVars: d };
          handleStoreVarsPayload(payload);
        } catch (e) { /* ignore */ }
      });
      // listen for client_js_exec event and execute the clientJS

      socket.on('client_js_exec', (data) => {
        //console.log('[OutputView] Received client_js_exec event with data:', data);
        try {
          if (data && data.clientJS && typeof data.clientJS === 'string') {
            console.log(`[OutputView] Executing clientJS from node ${data.nodeId}`, data.clientJS);
            // Execute the client-side JS code
            const script = document.createElement('script');
            script.textContent = data.clientJS;
            document.body.appendChild(script);
            document.body.removeChild(script);
          }
        } catch (e) {
          console.error('[OutputView] clientJS execution error:', e);
        }
      });
    } else if (projectId) {
      // poll for state every 5s
      const fetchOnce = async () => {
        try {
          const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/state`);
          if (resp.ok) {
            const json = await resp.json();
            await handleStoreVarsPayload(json.storeVars || {});
          }
        } catch (e) {}
      };
      fetchOnce();
      pollInterval = setInterval(fetchOnce, 5000);
    }

    return () => {
      if (socket && socket.off) {
        socket.off('store_vars_update', handleStoreVarsPayload);
        socket.off('execution_state', handleStoreVarsPayload);
        socket.off('global_store_vars_update');
        socket.off('client_js_exec');
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [socket, projectId]);

  // Run global store vars once by fetching /api/global-store and applying them
  // NOTE: OutputView relies on socket events to receive globalStoreVars.
  // We no longer poll /api/global-store on mount or expose Run Globals UI.

  // copyPositions removed per request (no UI button needed)

  return (
    <div className="output-view" role="region" aria-label="Output View">

        <button
          className="close-output"
          onClick={onClose}
          aria-label="Close output view"
          title="Close"
          style={{
            position: "absolute",
            right: 38,
            top: 8,
            width: 36,
            height: 36,
            borderRadius: 18,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M18 6L6 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 6L18 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

      <div
        id="output-body"
        className="output-body"
        style={{
          backgroundSize: "512px 512px",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {icons.map((icon) => (
          <div
            key={icon.id}
            className="dialogue-icon"
            style={{ left: icon.x, top: icon.y }}
            onPointerDown={(e) => onPointerDownIcon(e, icon)}
            onPointerMove={(e) => onPointerMoveIcon(e, icon)}
            onPointerUp={(e) => onPointerUpIcon(e, icon)}
            onClick={() => onClickIcon(icon)}
          >
            <div className="dialogue-main" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="dialogue-bubble">
              <div className="dialogue-bubble-line1">{icon.dialogueLine1 || (icon.name || "")}</div>
              <div
                className="dialogue-bubble-line2"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(icon.dialogueLine2 || "") }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
