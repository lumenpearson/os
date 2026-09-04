import { Label } from '@lumen/ui';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ManifestCapability, ManifestIssue, ManifestReport } from './manifest';
import { errorsOf, warningsOf } from './manifest';

function IssueRow({ issue }: { issue: ManifestIssue }) {
  const error = issue.level === 'error';
  const Glyph = error ? CircleAlert : TriangleAlert;
  return (
    <li className="flex items-start gap-2 py-1">
      <Glyph
        aria-hidden
        className={
          error ? 'mt-0.5 size-3.5 shrink-0 text-danger' : 'mt-0.5 size-3.5 shrink-0 text-ink-3'
        }
      />
      <span className="min-w-0 text-base text-ink">
        {issue.field && <span className="mono mr-1.5 text-sm text-ink-3">{issue.field}</span>}
        {issue.message}
      </span>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <Label>{title}</Label>
      {children}
    </section>
  );
}

export function CapabilityList({ capabilities }: { capabilities: readonly ManifestCapability[] }) {
  return (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {capabilities.map((c) => (
        <li key={c.id} className="py-1.5 text-base text-ink-2">
          {c.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything found in a manifest: what stops it being installed, what will be
 * ignored, and what installing it allows. Shown before anything is written.
 */
export function ReportView({ report }: { report: ManifestReport }) {
  const errors = errorsOf(report.issues);
  const warnings = warningsOf(report.issues);
  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 && (
        <Group title={errors.length === 1 ? '1 problem' : `${errors.length} problems`}>
          <ul>
            {errors.map((issue) => (
              <IssueRow key={`${issue.field}:${issue.message}`} issue={issue} />
            ))}
          </ul>
        </Group>
      )}
      {warnings.length > 0 && (
        <Group title={warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`}>
          <ul>
            {warnings.map((issue) => (
              <IssueRow key={`${issue.field}:${issue.message}`} issue={issue} />
            ))}
          </ul>
        </Group>
      )}
      {report.capabilities.length > 0 && (
        <Group title={report.manifest ? 'What it will be allowed to do' : 'What it asks for'}>
          <CapabilityList capabilities={report.capabilities} />
        </Group>
      )}
      {errors.length === 0 && warnings.length === 0 && report.manifest && (
        <p className="text-base text-ink-2">
          Every field reads correctly. Nothing in the file is ignored.
        </p>
      )}
    </div>
  );
}
