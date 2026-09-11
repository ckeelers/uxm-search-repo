import { prisma, Platform } from "@searchexperience/core";
import { upsertCompany, toggleCompanyFlag, deleteCompany } from "../actions";
import { SubmitButton } from "../../_components/submit-button";
import { RefreshingForm } from "../../_components/refreshing-form";
import s from "../shared.module.css";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: [{ platform: "asc" }, { slug: "asc" }],
    include: { _count: { select: { jobs: true } } },
  });

  const active = companies.filter((c) => c.active && !c.excluded).length;

  return (
    <>
      <p className={s.intro}>
        {companies.length} companies · {active} actively crawled
      </p>

      <RefreshingForm action={upsertCompany} className={s.form}>
        <div className={s.formTitle}>Add a company</div>
        <input name="slug" placeholder="slug (unique)" required className={s.input} />
        <input name="name" placeholder="Display name" required className={s.input} />
        <select name="platform" defaultValue="GREENHOUSE" className={s.input}>
          {Object.values(Platform).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input name="platformId" placeholder="board token / slug" className={s.input} />
        <input
          name="careersUrl"
          placeholder="careers URL (optional)"
          className={s.inputWide}
        />
        <SubmitButton className={s.addBtn}>Add</SubmitButton>
      </RefreshingForm>

      <div className={s.card2}>
        <table className={s.table}>
          <thead className={s.thead}>
            <tr>
              <th className={s.th}>Slug</th>
              <th className={s.th}>Platform</th>
              <th className={s.th}>Token</th>
              <th className={s.th}>Jobs</th>
              <th className={s.th}>State</th>
              <th className={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody className={s.tbody}>
            {companies.map((c) => (
              <tr key={c.id} className={c.excluded ? "opacity-40" : ""}>
                <td className={`${s.td} font-medium`}>{c.slug}</td>
                <td className={`${s.td} text-neutral-500`}>{c.platform}</td>
                <td className={`${s.td} text-neutral-500`}>{c.platformId ?? "—"}</td>
                <td className={s.td}>{c._count.jobs}</td>
                <td className={s.td}>
                  {c.excluded ? (
                    <span className="text-amber-700">excluded</span>
                  ) : c.active ? (
                    <span className="text-green-700">active</span>
                  ) : (
                    <span className="text-neutral-400">paused</span>
                  )}
                </td>
                <td className={s.td}>
                  <div className="flex flex-wrap gap-2">
                    <ToggleBtn
                      id={c.id}
                      flag="active"
                      label={c.active ? "Pause" : "Resume"}
                    />
                    <ToggleBtn
                      id={c.id}
                      flag="excluded"
                      label={c.excluded ? "Un-exclude" : "Exclude"}
                    />
                    <RefreshingForm action={deleteCompany}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="text-red-500 hover:underline">
                        Delete
                      </SubmitButton>
                    </RefreshingForm>
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
    <RefreshingForm action={toggleCompanyFlag}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="flag" value={flag} />
      <SubmitButton className="text-neutral-600 hover:underline">{label}</SubmitButton>
    </RefreshingForm>
  );
}
