"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreatePostPage() {
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    if (loading) return;

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData?.user) {
      setLoading(false);
      return;
    }

    let imageUrl = "";

    if (image) {
      const fileName = `${Date.now()}-${image.name}`;

      const { error: uploadError } = await supabase.storage
        .from("startup-posts")
        .upload(fileName, image);

      if (uploadError) {
        console.error(uploadError);
        setLoading(false);
        return;
      }

      const { data } = supabase.storage.from("startup-posts").getPublicUrl(fileName);

      imageUrl = data.publicUrl;
    }

    await supabase.from("posts").insert({
      startup_id: userData.user.id,
      description,
      image_url: imageUrl,
    });

    alert("Post created!");

    setDescription("");
    setImage(null);
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_#eef2ff_0%,_#ffffff_42%,_#f8fafc_100%)] p-8 shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
          Startup Updates
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
          Create a new post
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          Share product launches, hiring updates, traction milestones, fundraising news, or any
          progress your startup wants to highlight on MentBridge.
        </p>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
            Post Content
          </p>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Update description
            </label>
            <textarea
              placeholder="Share an update about your startup..."
              className="min-h-[240px] w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-8">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-600">
              Media
            </p>
            <h2 className="mt-4 text-xl font-semibold text-slate-950">Attach an image</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Add a banner, screenshot, or product visual to make the update more engaging.
            </p>

            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40">
              <span className="text-sm font-semibold text-slate-700">
                {image ? image.name : "Choose an image"}
              </span>
              <span className="mt-2 text-xs leading-6 text-slate-500">
                PNG, JPG, or product screenshot for your update card.
              </span>
              <input
                type="file"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div className="rounded-[2rem] border border-amber-100 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_100%)] p-8 shadow-[0_18px_40px_rgba(245,158,11,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">
              Publish
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Once posted, your update appears in your startup surfaces and linked post views.
            </p>

            <button
              onClick={handlePost}
              disabled={loading}
              className="mt-6 w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Posting..." : "Publish Post"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
