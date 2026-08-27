import type { Workflow, WorkflowLink } from '@/api/types';

/**
 * Replace one workflow input connection while keeping every copy of the link
 * in sync. ComfyUI's graph stores a connection in the link table, on the
 * target input, and on the source output, so changing only inputs[].link leaves
 * a graph that looks connected to one consumer but is stale everywhere else.
 */
export function replaceWorkflowInputLink(
  workflow: Workflow,
  targetNodeId: number,
  targetInputSlot: number,
  sourceNodeId: number,
  sourceOutputSlot: number,
): Workflow {
  const targetNode = workflow.nodes.find((node) => node.id === targetNodeId);
  const sourceNode = workflow.nodes.find((node) => node.id === sourceNodeId);
  const targetInput = targetNode?.inputs?.[targetInputSlot];
  const sourceOutput = sourceNode?.outputs?.[sourceOutputSlot];
  if (!targetNode || !sourceNode || !targetInput || !sourceOutput) return workflow;

  const oldLinkIds = new Set<number>();
  if (targetInput.link != null) oldLinkIds.add(targetInput.link);
  for (const link of workflow.links) {
    if (link[3] === targetNodeId && link[4] === targetInputSlot) {
      oldLinkIds.add(link[0]);
    }
  }

  // If the requested edge is already complete, preserve its id and avoid
  // needlessly growing the workflow link counter on every generation.
  const currentLink = targetInput.link == null
    ? undefined
    : workflow.links.find((link) => link[0] === targetInput.link);
  if (
    currentLink
    && currentLink[1] === sourceNodeId
    && currentLink[2] === sourceOutputSlot
    && currentLink[3] === targetNodeId
    && currentLink[4] === targetInputSlot
    && (sourceOutput.links ?? []).includes(currentLink[0])
    && workflow.links.filter(
      (link) => link[3] === targetNodeId && link[4] === targetInputSlot,
    ).length === 1
  ) {
    return workflow;
  }

  const nextLinkId = getNextLinkId(workflow);
  const linkType = sourceOutput.type || targetInput.type || '*';
  const nextLink: WorkflowLink = [
    nextLinkId,
    sourceNodeId,
    sourceOutputSlot,
    targetNodeId,
    targetInputSlot,
    linkType,
  ];

  const nextNodes = workflow.nodes.map((node) => {
    let nextInputs = node.inputs;
    if (node.inputs?.some((input) => input.link != null && oldLinkIds.has(input.link))) {
      nextInputs = node.inputs.map((input) => (
        input.link != null && oldLinkIds.has(input.link)
          ? { ...input, link: null }
          : input
      ));
    }
    if (node.id === targetNodeId && nextInputs?.[targetInputSlot]) {
      nextInputs = [...nextInputs];
      nextInputs[targetInputSlot] = {
        ...nextInputs[targetInputSlot]!,
        link: nextLinkId,
      };
    }

    let nextOutputs = node.outputs;
    if (node.outputs) {
      nextOutputs = node.outputs.map((output, slotIndex) => {
        const filteredLinks = (output.links ?? []).filter((id) => !oldLinkIds.has(id));
        if (node.id === sourceNodeId && slotIndex === sourceOutputSlot) {
          return { ...output, links: [...new Set([...filteredLinks, nextLinkId])] };
        }
        if (filteredLinks.length !== (output.links ?? []).length) {
          return { ...output, links: filteredLinks };
        }
        return output;
      });
    }

    if (nextInputs === node.inputs && nextOutputs === node.outputs) return node;
    return {
      ...node,
      inputs: nextInputs,
      outputs: nextOutputs,
    };
  });

  return {
    ...workflow,
    last_link_id: nextLinkId,
    nodes: nextNodes,
    links: [
      ...workflow.links.filter((link) => !oldLinkIds.has(link[0])),
      nextLink,
    ],
  };
}

function getNextLinkId(workflow: Workflow): number {
  let highest = Math.max(0, workflow.last_link_id);
  for (const link of workflow.links) highest = Math.max(highest, link[0]);
  for (const node of workflow.nodes) {
    for (const input of node.inputs ?? []) {
      if (input.link != null) highest = Math.max(highest, input.link);
    }
    for (const output of node.outputs ?? []) {
      for (const linkId of output.links ?? []) highest = Math.max(highest, linkId);
    }
  }
  return highest + 1;
}
