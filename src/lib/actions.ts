'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// --- Interfaces and Schemas ---

export interface KnowledgeNode {
  id: string;
  content: string;
  type: 'note' | 'url';
  createdAt: string;
  keywords: string[];
}

type StorableNode = Omit<KnowledgeNode, 'keywords'> & {
  keywords: string;
};

const addNodeSchema = z.object({
  content: z.string().min(3, 'Content must be at least 3 characters.'),
});

const editNodeSchema = z.object({
  nodeId: z.string().uuid('Invalid Node ID.'),
  content: z.string().min(3, 'Content must be at least 3 characters.'),
});

const deleteNodeSchema = z.object({
  nodeId: z.string().uuid('Invalid Node ID.'),
});

export type AddNodeFormState = {
  status: 'error' | 'success' | 'idle';
  message: string;
};

// --- Helper Functions ---

function parseNode(
  redisResult: Record<string, string> | null
): KnowledgeNode | null {
  if (!redisResult || Object.keys(redisResult).length === 0) return null;
  try {
    return {
      ...redisResult,
      keywords: JSON.parse(redisResult.keywords || '[]'),
    } as unknown as KnowledgeNode;
  } catch (e) {
    console.error('Failed to parse node:', redisResult, e);
    return null;
  }
}

function extractKeywords(content: string): string[] {
  return [
    ...new Set(
      content
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2 && !/^\d+$/.test(word))
        .map((word) => word.replace(/[.,!?]/g, ''))
        .slice(0, 10)
    ),
  ];
}

// --- Server Actions ---

export async function addNodeAction(
  prevState: AddNodeFormState,
  formData: FormData
): Promise<AddNodeFormState> {
  const validatedFields = addNodeSchema.safeParse({
    content: formData.get('content'),
  });

  if (!validatedFields.success) {
    return {
      status: 'error',
      message:
        validatedFields.error.flatten().fieldErrors.content?.[0] ||
        'Invalid input.',
    };
  }

  const { content } = validatedFields.data;
  const keywords = extractKeywords(content);
  const nodeId = uuidv4();
  const node: KnowledgeNode = {
    id: nodeId,
    content,
    type: content.startsWith('http') ? 'url' : 'note',
    createdAt: new Date().toISOString(),
    keywords,
  };

  try {
    const pipeline = db.pipeline();
    const storableNode: StorableNode = {
      ...node,
      keywords: JSON.stringify(node.keywords),
    };
    pipeline.hset(`node:${nodeId}`, storableNode);
    pipeline.sadd('nodes', nodeId);
    for (const keyword of keywords) {
      pipeline.sadd(`keyword:${keyword}`, nodeId);
    }
    await pipeline.exec();
    revalidatePath('/');
    return { status: 'success', message: 'Node added!' };
  } catch (error) {
    console.error('Failed to add node:', error);
    return { status: 'error', message: 'Database error.' };
  }
}

export async function deleteNodeAction(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const validatedFields = deleteNodeSchema.safeParse({
    nodeId: formData.get('nodeId'),
  });
  if (!validatedFields.success)
    return { success: false, message: 'Invalid Node ID.' };

  const { nodeId } = validatedFields.data;

  try {
    const nodeData = await db.hgetall(`node:${nodeId}`);
    const node = parseNode(nodeData);

    if (!node) return { success: false, message: 'Node not found.' };

    const pipeline = db.pipeline();
    // Remove from global node set
    pipeline.srem('nodes', nodeId);
    // Remove from keyword sets
    for (const keyword of node.keywords) {
      pipeline.srem(`keyword:${keyword}`, nodeId);
    }
    // Delete the node hash itself
    pipeline.del(`node:${nodeId}`);
    await pipeline.exec();

    revalidatePath('/');
    return { success: true, message: 'Node deleted.' };
  } catch (error) {
    console.error('Delete failed:', error);
    return { success: false, message: 'Database error.' };
  }
}

export async function editNodeAction(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const validatedFields = editNodeSchema.safeParse({
    nodeId: formData.get('nodeId'),
    content: formData.get('content'),
  });
  if (!validatedFields.success)
    return { success: false, message: 'Invalid data.' };

  const { nodeId, content } = validatedFields.data;

  try {
    const oldNodeData = await db.hgetall(`node:${nodeId}`);
    const oldNode = parseNode(oldNodeData);
    if (!oldNode) return { success: false, message: 'Node not found.' };

    const oldKeywords = new Set(oldNode.keywords);
    const newKeywords = new Set(extractKeywords(content));

    const keywordsToAdd = [...newKeywords].filter((kw) => !oldKeywords.has(kw));
    const keywordsToRemove = [...oldKeywords].filter(
      (kw) => !newKeywords.has(kw)
    );

    const pipeline = db.pipeline();

    // Update the node hash with new content and stringified keywords
    pipeline.hset(`node:${nodeId}`, {
      content,
      keywords: JSON.stringify([...newKeywords]),
    });

    // Update keyword relationships
    for (const keyword of keywordsToAdd) {
      pipeline.sadd(`keyword:${keyword}`, nodeId);
    }
    for (const keyword of keywordsToRemove) {
      pipeline.srem(`keyword:${keyword}`, nodeId);
    }

    await pipeline.exec();
    revalidatePath('/');
    return { success: true, message: 'Node updated.' };
  } catch (error) {
    console.error('Edit failed:', error);
    return { success: false, message: 'Database error.' };
  }
}

export async function getAllNodes(): Promise<KnowledgeNode[]> {
  try {
    const nodeIds = await db.smembers('nodes');
    if (!nodeIds || nodeIds.length === 0) return [];
    const pipeline = db.pipeline();
    nodeIds.forEach((id) => pipeline.hgetall(`node:${id}`));
    const results = await pipeline.exec();
    return results!
      .map(([err, data]) =>
        err ? null : parseNode(data as Record<string, string>)
      )
      .filter((node): node is KnowledgeNode => node !== null)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch (error) {
    console.error('Failed to fetch all nodes:', error);
    return [];
  }
}

export async function searchNodes(query: string): Promise<KnowledgeNode[]> {
  if (!query.trim()) return [];
  const searchTerms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2)
    ),
  ];
  if (searchTerms.length === 0) return [];
  try {
    const keywordKeys = searchTerms.map((term) => `keyword:${term}`);
    const matchingNodeIds = await db.sunion(keywordKeys);
    if (matchingNodeIds.length === 0) return [];
    const pipeline = db.pipeline();
    matchingNodeIds.forEach((id) => pipeline.hgetall(`node:${id}`));
    const results = await pipeline.exec();
    return results!
      .map(([err, data]) =>
        err ? null : parseNode(data as Record<string, string>)
      )
      .filter((node): node is KnowledgeNode => node !== null)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}
