'use client';

import {
  addNodeAction,
  AddNodeFormState,
  deleteNodeAction,
  editNodeAction,
  getAllNodes,
  KnowledgeNode,
  searchNodes,
} from '@/lib/actions';
import {
  useActionState,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  BotMessageSquare,
  BrainCircuit,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// --- STYLES ---
const glassCardStyle =
  'bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl shadow-lg';

// --- NodeCard Component (with Edit/Delete) ---
function NodeCard({
  node,
  onDelete,
  onEditSuccess,
}: {
  node: KnowledgeNode;
  onDelete: (nodeId: string) => void;
  onEditSuccess: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(node.content);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('nodeId', node.id);
      formData.append('content', editedContent);
      const result = await editNodeAction(formData);

      if (result.success) {
        toast.success(result.message);
        setIsEditing(false);
        onEditSuccess();
      } else {
        toast.error(result.message);
      }
    });
  };

  if (isEditing) {
    return (
      <Card className={`${glassCardStyle} ring-2 ring-slate-400`}>
        <CardContent className="p-4">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className={`${glassCardStyle} min-h-[100px] text-base focus:border-white/30`}
          />
        </CardContent>
        <CardFooter className="flex justify-end gap-2 p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(false)}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? '...' : <Check className="h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={`${glassCardStyle} overflow-hidden`}>
      <CardContent className="p-4">
        <p className="text-slate-200 whitespace-pre-wrap break-words">
          {node.content}
        </p>
        {node.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {node.keywords.map((kw) => (
              <span
                key={kw}
                className="bg-slate-700/50 text-slate-300 text-xs px-2 py-0.5 rounded-full"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center p-2 bg-black/10">
        <p className="text-xs text-slate-500 pl-2">
          {new Date(node.createdAt).toLocaleString()}
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-400 hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className={glassCardStyle}>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  node from your knowledge graph.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(node.id)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardFooter>
    </Card>
  );
}

// --- Add Node Form Component ---
function AddNodeForm({ onActionSuccess }: { onActionSuccess: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialState: AddNodeFormState = { status: 'idle', message: '' };
  const [state, formAction, isPending] = useActionState(
    addNodeAction,
    initialState
  );

  useEffect(() => {
    if (state.status === 'success') {
      toast.success(state.message);
      formRef.current?.reset();
      onActionSuccess();
    } else if (state.status === 'error') {
      toast.error(state.message);
    }
  }, [state, onActionSuccess]);

  return (
    <form action={formAction} ref={formRef}>
      <Textarea
        name="content"
        placeholder="Add a note, idea, or URL..."
        className={`${glassCardStyle} min-h-[100px] text-base focus:border-white/30`}
        required
      />
      <Button type="submit" className="mt-3 w-full" disabled={isPending}>
        <Plus className="mr-2 h-4 w-4" />
        {isPending ? 'Adding...' : 'Add to Knowledge Graph'}
      </Button>
    </form>
  );
}

// --- Main Page Component ---
export default function HomePage() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);

  // The optimistic reducer now handles both adding and deleting
  const [optimisticNodes, optimisticUpdate] = useOptimistic(
    nodes,
    (
      currentState,
      { action, payload }: { action: 'add' | 'delete'; payload: any }
    ) => {
      if (action === 'add') {
        return [payload, ...currentState];
      }
      if (action === 'delete') {
        return currentState.filter((node) => node.id !== payload.nodeId);
      }
      return currentState;
    }
  );

  const [searchResults, setSearchResults] = useState<KnowledgeNode[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAndSetNodes = useCallback(async () => {
    setIsLoading(true);
    const allNodes = await getAllNodes();
    setNodes(allNodes);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAndSetNodes();
  }, [fetchAndSetNodes]);

  const handleDelete = async (nodeId: string) => {
    optimisticUpdate({ action: 'delete', payload: { nodeId } });
    const formData = new FormData();
    formData.append('nodeId', nodeId);
    const result = await deleteNodeAction(formData);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
      fetchAndSetNodes(); // Revert optimistic update on failure
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSearchResults(await searchNodes(searchTerm));
    setIsSearching(false);
  };

  const displayedNodes = searchTerm ? searchResults : optimisticNodes;

  return (
    <main className="min-h-screen bg-black text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
            Personal Knowledge Graph
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Your personal semantic brain, powered by Next.js and DragonflyDB.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            <Card className={glassCardStyle}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus /> Add Knowledge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AddNodeForm onActionSuccess={fetchAndSetNodes} />
              </CardContent>
            </Card>
            <Card className={glassCardStyle}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search /> Semantic Search
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch}>
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search for 'fast databases'..."
                    className={`${glassCardStyle} text-base focus:border-white/30`}
                  />
                  <Button
                    type="submit"
                    className="mt-3 w-full"
                    disabled={isSearching}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className={glassCardStyle}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isSearching || searchTerm ? (
                  <BotMessageSquare />
                ) : (
                  <BrainCircuit />
                )}
                {isSearching
                  ? 'Searching...'
                  : searchTerm
                  ? `Search Results for "${searchTerm}"`
                  : 'Knowledge Stream'}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
              {isLoading && displayedNodes.length === 0 && (
                <p className="text-slate-400">Loading knowledge...</p>
              )}
              {!isLoading && displayedNodes.length === 0 && (
                <p className="text-slate-400 text-center py-8">
                  {searchTerm
                    ? 'No related knowledge found.'
                    : 'Your graph is empty. Add a node!'}
                </p>
              )}
              {displayedNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  onDelete={handleDelete}
                  onEditSuccess={fetchAndSetNodes}
                />
              ))}
            </CardContent>
          </div>
        </div>
      </div>
    </main>
  );
}
