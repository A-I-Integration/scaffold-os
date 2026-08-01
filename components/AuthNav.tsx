'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AuthNav() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profile)
      }
    }
    getUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isAdminOrDisponent = profile?.role === 'admin' || profile?.role === 'disponent'

  if (!user) return null

  return (
    <div className="w-full bg-[#1e293b] border-b border-[#334155] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {profile?.full_name?.charAt(0) || user.email?.charAt(0)}
          </div>
          <div>
            <p className="text-white text-sm font-medium">
              {profile?.full_name || user.email}
            </p>
            <p className="text-[#64748b] text-xs capitalize">
              {profile?.role || 'User'}
            </p>
          </div>
        </div>
        
        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-1 ml-6 border-l border-[#334155] pl-6">
          <button 
            onClick={() => router.push('/')}
            className="text-sm text-[#94a3b8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#334155] transition"
          >
            Projekte
          </button>
          
          {isAdminOrDisponent && (
            <button 
              onClick={() => router.push('/dashboard')}
              className="text-sm text-[#94a3b8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#334155] transition flex items-center gap-1"
            >
              <span>📊</span> Dashboard
            </button>
          )}
          
          <button 
            onClick={() => router.push('/aufmass')}
            className="text-sm text-[#94a3b8] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#334155] transition"
          >
            + Aufmaß
          </button>
        </div>
      </div>
      
      <button
        onClick={handleLogout}
        className="text-sm text-[#94a3b8] hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-[#334155]"
      >
        Abmelden
      </button>
    </div>
  )
}