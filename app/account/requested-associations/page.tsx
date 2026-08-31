"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import PageSkeleton from "@/components/ui/PageSkeleton"

type RequestedAssociation = {
id: string
message?: string | null
veterans?: {
name?: string | null
photo_url?: string | null
} | null
}

export default function RequestedAssociationsPage(){

const [requests,setRequests] = useState<RequestedAssociation[]>([])
const [loading,setLoading] = useState(true)

useEffect(()=>{
const loadRequests = async()=>{

setLoading(true)

const { data:userData } = await supabase.auth.getUser()
const user = userData?.user

if(!user){
setLoading(false)
return
}

const { data:startup } = await supabase
.from("startups")
.select("id")
.eq("user_id",user.id)
.single()

if(!startup){
setLoading(false)
return
}

const { data } = await supabase
.from("association_requests")
.select(`
*,
veterans(name,photo_url)
`)
.eq("startup_id",startup.id)
.eq("status","pending")
.order("created_at",{ascending:false})

setRequests((data as RequestedAssociation[] | null) || [])
setLoading(false)

}

loadRequests()
},[])


if(loading){
return <PageSkeleton variant="list" />
}

return(

<div className="p-8">

<h1 className="text-2xl font-bold mb-6">
Requested Associations
</h1>

{requests.length === 0 && (

<div className="bg-white p-6 rounded-xl shadow">
No pending requests.
</div>

)}

{requests.map((r)=>(
<div
key={r.id}
className="bg-white p-6 rounded-xl shadow flex justify-between items-center mb-4"
>

<div className="flex items-center gap-4">

<img
src={r.veterans?.photo_url || "/placeholder-avatar.png"}
alt={r.veterans?.name || "Industry expert"}
className="w-10 h-10 rounded-full"
/>

<div>

<div className="font-semibold">
{r.veterans?.name || "Industry expert"}
</div>

<div className="text-sm text-gray-500">
{r.message}
</div>

</div>

</div>

<div className="text-sm text-gray-400">
Pending
</div>

</div>
))}

</div>

)

}
