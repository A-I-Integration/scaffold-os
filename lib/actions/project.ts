'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveProject(data: {
  name: string;
  adresse: string;
  data: Record<string, any>;
  status?: string;
}) {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: data.name,
      adresse: data.adresse,
      data: data.data,
      status: data.status || 'active',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Projekt konnte nicht gespeichert werden: ${error.message}`);
  }

  if (!project) {
    throw new Error('Keine Projekt-ID zurückgegeben');
  }

  revalidatePath('/projekte');
  revalidatePath('/dashboard');
  return { id: project.id };
}