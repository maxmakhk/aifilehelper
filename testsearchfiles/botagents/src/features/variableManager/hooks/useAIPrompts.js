import { useState, useCallback, useRef } from 'react';
import { generateRuleFromPrompt, generateWorkflowVisualization } from '../services/ai/aichatService';

/**
 * useAIPrompts hook
 * Manages AI-based rule and workflow generation
 */
export default function useAIPrompts() {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiWarning, setAiWarning] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [generatingRuleIndex, setGeneratingRuleIndex] = useState(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');

  // Generate rule from prompt
  const generateRule = useCallback(
    async (index, rulePrompt, updateRuleSource) => {
      if (!rulePrompt || !rulePrompt.trim()) {
        setAiWarning('Please enter a prompt first.');
        return;
      }

      try {
        setGeneratingRuleIndex(index);
        setAiWarning('Generating rule...');

        const expression = await generateRuleFromPrompt(rulePrompt);

        if (!expression) {
          setAiWarning('Failed to generate rule from prompt.');
          return;
        }

        // Update the rule source with generated expression
        updateRuleSource(index, expression);
        setAiWarning(`Rule generated: ${expression}`);
        setTimeout(() => setAiWarning(''), 3000);
      } catch (err) {
        console.error('Error generating rule:', err);
        setAiWarning('Error generating rule: ' + err.message);
        setTimeout(() => setAiWarning(''), 3000);
      } finally {
        setGeneratingRuleIndex(null);
      }
    },
    []
  );

  // Generate workflow from prompt
  const generateWorkflow = useCallback(async (prompt) => {
    if (!prompt || !prompt.trim()) {
      setWorkflowError('Please enter a workflow description.');
      return null;
    }

    try {
      setWorkflowLoading(true);
      setWorkflowError('');

      const workflow = await generateWorkflowVisualization(prompt);

      if (!workflow) {
        setWorkflowError('Failed to generate workflow.');
        return null;
      }

      return workflow;
    } catch (err) {
      console.error('Error generating workflow:', err);
      setWorkflowError('Error generating workflow: ' + err.message);
      return null;
    } finally {
      setWorkflowLoading(false);
    }
  }, []);

  return {
    aiPrompt,
    setAiPrompt,
    aiResponse,
    setAiResponse,
    aiWarning,
    setAiWarning,
    aiLoading,
    setAiLoading,
    generatingRuleIndex,
    setGeneratingRuleIndex,
    workflowLoading,
    setWorkflowLoading,
    workflowError,
    setWorkflowError,
    generateRule,
    generateWorkflow,
  };
}
