import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import type { GetServerSidePropsContext } from 'next'

// This is a client-side-only instance of the Supabase client.
// It is created using the browser-specific helper and is safe to use in components and useEffects.
// It correctly handles setting auth cookies.
export const supabase = createPagesBrowserClient({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
})

// This is a server-side-only function to create a Supabase client.
// It should be used in `getServerSideProps` or API routes.
// It correctly reads auth cookies from the request.
export const createServerSupabaseClient = (context: GetServerSidePropsContext) => {
  return createPagesServerClient(context, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  })
}