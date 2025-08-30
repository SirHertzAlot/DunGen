import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemForm } from '@/components/admin/ItemForm';

export default function CreateItem() {
  const { mutate, isPending, isSuccess, isError } = useMutation({
    mutationFn: async (data: { name: string; type: string; description: string; stats: string }) => {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create item');
      }
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Create New Item</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemForm onSubmit={mutate} isLoading={isPending} />
            {isSuccess && <p className="text-green-500">Item created successfully!</p>}
            {isError && <p className="text-red-500">Failed to create item. Please try again.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
