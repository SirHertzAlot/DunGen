import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';

export function useApiQuery<T>(
  options: UseQueryOptions<T, Error, T, QueryKey>
) {
  return useQuery<T>({
    ...options,
    queryFn: async () => {
      const response = await fetch(options.queryKey[0] as string);
      if (!response.ok) {
        throw new Error(`Failed to fetch data from ${options.queryKey[0]}`);
      }
      return response.json();
    },
  });
}
