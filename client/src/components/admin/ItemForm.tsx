import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ItemFormProps {
  onSubmit: (data: { name: string; type: string; description: string; stats: string }) => void;
  isLoading: boolean;
}

export function ItemForm({ onSubmit, isLoading }: ItemFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    stats: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
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
    </form>
  );
}
