import { prisma, Platform } from "@searchexperience/core";
import { upsertCompany, toggleCompanyFlag, deleteCompany } from "../actions";
import { SubmitButton } from "../../_components/submit-button";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: [{ platform: "asc" }, { slug: "asc" }],
    include: { _count: { select: { jobs: true } } },
  });

  const active = companies.filter((c) => c.active && !c.excluded).length;

  return (
    <>
      <p className="mb-4 text-sm text-neutral-500">
        {companies.length} companies · {active} actively crawled
      </p>

      <form
        action={upsertCompany}
        className="mb-6 grid gap-2 rounded-lg border border-neutral-200 p-4 text-sm sm:grid-cols-2"
      >
        <div className="font-medium sm:col-span-2">Add a company</div>
        <input name="slug" placeholder="slug (unique)" required className="rounded border border-neutral-300 px-2 py-1" />
        <input name="name" placeholder="Display name" required className="rounded border border-neutral-300 px-2 py-1" />
        <select name="platform" defaultValue="GREENHOUSE" className="rounded border border-neutral-300 px-2 py-1">
          {Object.values(Platform).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input name="platformId" placeholder="board token / slug" className="rounded border border-neutral-300 px-2 py-1" />
        <input name="careersUrl" placeholder="careers URL (optional)" className="rounded border border-neutral-300 px-2 py-1 sm:col-span-2" />
        <SubmitButton className="justify-self-start rounded bg-neutral-900 px-3 py-1.5 text-white">
          Add
        </SubmitButton>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-3">Slug</th>
              <th className="py-2 pr-3">Platform</th>
              <th className="py-2 pr-3">Token</th>
              <th className="py-2 pr-3">Jobs</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {companies.map((c) => (
              <tr key={c.id} className={c.excluded ? "opacity-40" : ""}>
                <td className="py-2 pr-3 font-medium">{c.slug}</td>
                <td className="py-2 pr-3 text-neutral-500">{c.platform}</td>
                <td className="py-2 pr-3 text-neutral-500">{c.platformId ?? "—"}</td>
                <td className="py-2 pr-3">{c._count.jobs}</td>
                <td className="py-2 pr-3">
                  {c.excluded ? (
                    <span className="text-amber-700">excluded</span>
                  ) : c.active ? (
                    <span className="text-green-700">active</span>
                  ) : (
                    <span className="text-neutral-400">paused</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    <ToggleBtn id={c.id} flag="active" label={c.active ? "Pause" : "Resume"} />
                    <ToggleBtn
                      id={c.id}
                      flag="excluded"
                      label={c.excluded ? "Un-exclude" : "Exclude"}
                    />
                    <form action={deleteCompany}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="text-red-500 hover:underline">
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ToggleBtn({ id, flag, label }: { id: string; flag: string; label: string }) {
  return (
    <form action={toggleCompanyFlag}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="flag" value={flag} />
      <SubmitButton className="text-neutral-600 hover:underline">{label}</SubmitButton>
    </form>
  );
}
