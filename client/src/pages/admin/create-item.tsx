import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function CreateItem() {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    stats: '',
  });

  const { mutate, isLoading, isSuccess, isError } = useMutation({
    mutationFn: async (data: typeof formData) => {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(formData);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Create New Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Item Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter item name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="type">Item Type</Label>
                <Input
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  placeholder="Enter item type (e.g., weapon, armor)"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Enter item description"
                  required
                />
              </div>
              <div>
                <Label htmlFor="stats">Stats</Label>
                <Input
                  id="stats"
                  name="stats"
                  value={formData.stats}
                  onChange={handleChange}
                  placeholder="Enter item stats (e.g., +10 attack)"
                  required
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Item'}
              </Button>
              {isSuccess && <p className="text-green-500">Item created successfully!</p>}
              {isError && <p className="text-red-500">Failed to create item. Please try again.</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
