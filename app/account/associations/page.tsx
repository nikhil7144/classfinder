"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import PageSkeleton from "@/components/ui/PageSkeleton"

type Association = {
id: string
title?: string | null
association_type?: string | null
active?: boolean | null
startups?: {
startup_name?: string | null
logo_url?: string | null
} | null
veterans?: {
name?: string | null
photo_url?: string | null
} | null
}

export default function AssociationsPage(){

const [associations,setAssociations] = useState<Association[]>([])
const [loading,setLoading] = useState(true)
const [viewerRole,setViewerRole] = useState<"startup" | "veteran" | null>(null)

const router = useRouter()

useEffect(()=>{
const loadAssociations = async()=>{

setLoading(true)

const { data:userData } = await supabase.auth.getUser()
const user = userData?.user

if(!user){
setLoading(false)
return
}

const { data:veteran } = await supabase
.from("veterans")
.select("id")
.eq("user_id",user.id)
.single()

const { data:startup } = await supabase
.from("startups")
.select("id")
.eq("user_id",user.id)
.single()

let data: Association[] = []

if(veteran){
setViewerRole("veteran")

const res = await supabase
.from("associations")
.select(`
*,
startups(startup_name,logo_url)
`)
.eq("veteran_id",veteran.id)

data = (res.data as Association[] | null) || []

}

if(startup){
setViewerRole("startup")

const res = await supabase
.from("associations")
.select(`
*,
veterans(name,photo_url)
`)
.eq("startup_id",startup.id)

data = (res.data as Association[] | null) || []

}

setAssociations(data)
setLoading(false)

}

loadAssociations()
},[])

if(loading){
return <PageSkeleton variant="list" />
}

return(

<div className="min-h-screen bg-gradient-to-b from-white via-stone-50 to-white py-10">
<div className="max-w-6xl mx-auto px-6">
<div className="space-y-8">
<div className="relative rounded-3xl border border-gray-200 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
<div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-50/50 to-transparent pointer-events-none" />
<div className="relative z-10">
<p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
Active Network
</p>
<h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
Associations
</h1>
<p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
Review active connections and jump directly into conversation with your current startup or industry expert partners.
</p>
</div>
</div>

{associations.length === 0 && (
<div className="rounded-3xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
No associations yet.
</div>
)}

<div className="space-y-5">
{associations.map((a)=>{
const counterpartName =
viewerRole === "startup"
? a.veterans?.name
: a.startups?.startup_name

const counterpartAvatar =
viewerRole === "startup"
? a.veterans?.photo_url
: a.startups?.logo_url

return (
<article
key={a.id}
className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm transition hover:shadow-lg"
>
<div className="grid gap-6 md:grid-cols-[88px_1fr]">
<div className="flex items-start justify-center md:justify-start">
{counterpartAvatar ? (
<img
src={counterpartAvatar}
alt={counterpartName || "Association"}
className="h-20 w-20 rounded-2xl border border-gray-200 object-cover bg-white"
/>
) : (
<div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-2xl font-semibold text-gray-600">
{(counterpartName || "?").charAt(0).toUpperCase()}
</div>
)}
</div>

<div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
<div>
<h2 className="text-2xl font-bold tracking-tight text-gray-900">
{counterpartName}
</h2>
<div className="mt-3 flex flex-wrap gap-2">
<span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
{a.title || "Active Association"}
</span>
{a.association_type && (
<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium capitalize text-emerald-700">
{a.association_type}
</span>
)}
{a.active && (
<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
Active
</span>
)}
</div>
<p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
Open the chat workspace to continue the discussion, share updates, and keep the association moving.
</p>
</div>

<div className="flex items-center">
<button
onClick={()=>router.push(`/chat/${a.id}`)}
className="rounded-xl bg-indigo-600 px-6 py-3 text-white shadow-md transition hover:bg-indigo-700 hover:shadow-lg"
>
Open Chat
</button>
</div>
</div>
</div>
</article>
)
})}
</div>
</div>
</div>
</div>

)

}
