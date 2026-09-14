'use client';

// Floating "Report a bug" — the fleet launcher + form, now the shared
// microport-ui `BugReportLauncher` (v0.60). ProductPort keeps three things of
// its own: the transport (multipart when a screenshot is attached, JSON via
// api() otherwise), its `bug`/`confirmDialog` i18n keys, and the dirty-discard
// guard — which is why the lib grew `confirmOnDirty`.
//
// Every AUTHED user can file; the form POSTs to /api/bug-reports, which signs +
// forwards to the SalesPort central queue. The lib portals the launcher into
// document.body so the fixed button escapes the app shell's stacking/overflow
// (and Firefox paints it). bug-report-fanout, feedback_helpbutton_inline_zindex.
import { useTranslations } from 'next-intl';
import { BugReportLauncher, type BugReportPayload, type BugReportResult } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { testId } from '@/lib/i18nIds';

const NS = 'bugReport';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '';

export function BugReportButton() {
  const t = useTranslations('bug');
  const tc = useTranslations('confirmDialog');
  const { user } = useAuth();
  const { toast } = useToast();

  async function submit(p: BugReportPayload): Promise<BugReportResult> {
    // The lib captures `pathname + search`; the hub queue has always received
    // the absolute URL, which is what identifies the satellite in triage.
    const pageUrl = typeof window !== 'undefined' ? window.location.origin + p.pageUrl : p.pageUrl;
    try {
      if (p.screenshot) {
        // Multipart path — the api() helper forces a JSON Content-Type, which
        // breaks the multipart boundary, so raw fetch with the CSRF header +
        // cookies (NO Content-Type; the browser sets the multipart boundary).
        const form = new FormData();
        form.append('title', p.title);
        form.append('description', p.description);
        form.append('priority', p.priority);
        form.append('pageUrl', pageUrl);
        if (p.browserAgent) form.append('browserAgent', p.browserAgent);
        if (p.viewportSize) form.append('viewportSize', p.viewportSize);
        if (p.appVersion) form.append('appVersion', p.appVersion);
        form.append('eventId', p.eventId);
        form.append('screenshot', p.screenshot);
        const res = await fetch('/api/bug-reports', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'productport-web' },
          body: form,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        // No screenshot — the existing JSON path is unchanged.
        await api('/api/bug-reports', {
          method: 'POST',
          body: JSON.stringify({
            title: p.title,
            description: p.description,
            priority: p.priority,
            pageUrl,
            browserAgent: p.browserAgent,
            viewportSize: p.viewportSize,
            appVersion: p.appVersion,
            eventId: p.eventId,
          }),
        });
      }
      return { ok: true };
    } catch {
      return { error: t('errorSend') };
    }
  }

  return (
    <BugReportLauncher
      // Auth-gated: only signed-in users file (mirrors the fleet). Never render
      // on the logged-out /login page.
      enabled={!!user}
      // React's ButtonHTMLAttributes has no data-* index signature (those are
      // only legal inline in JSX), so the spread needs a cast.
      buttonProps={testId(NS, 'launcher') as React.ButtonHTMLAttributes<HTMLButtonElement>}
      submit={submit}
      appVersion={APP_VERSION}
      confirmOnDirty
      onSuccess={() => toast(t('thanks'), 'ok')}
      labels={{
        title: t('label'),
        launcher: t('label'),
        fieldTitle: t('titleLabel'),
        fieldTitlePlaceholder: t('titlePlaceholder'),
        fieldDescription: t('detailLabel'),
        fieldDescriptionPlaceholder: t('detailPlaceholder'),
        fieldPriority: t('priorityLabel'),
        priorityLow: t('priority_low'),
        priorityNormal: t('priority_normal'),
        priorityHigh: t('priority_high'),
        priorityCritical: t('priority_critical'),
        fieldScreenshot: t('screenshotLabel'),
        screenshotPrivacyWarning: t('screenshotPrivacy'),
        screenshotAddTitle: t('screenshotAdd'),
        screenshotDropHint: t('screenshotHint'),
        screenshotDropActive: t('screenshotDropActive'),
        screenshotMaxSize: t('screenshotMaxSize'),
        screenshotOptimizing: t('screenshotOptimizing'),
        screenshotPreviewAlt: t('screenshotPreviewAlt'),
        chooseScreenshot: t('screenshotChoose'),
        replaceScreenshot: t('screenshotReplace'),
        removeScreenshot: t('screenshotRemove'),
        capturedContext: t('capturedContext'),
        ctxPage: t('ctxPage'),
        ctxViewport: t('ctxViewport'),
        ctxAppVersion: t('ctxAppVersion'),
        ctxBrowser: t('ctxBrowser'),
        errorTitleRequired: t('errorTitle'),
        errorDescriptionRequired: t('errorDetail'),
        errorScreenshotTooLarge: t('errorScreenshotTooLarge'),
        errorScreenshotNotAnImage: t('errorScreenshotNotImage'),
        errorSubmitFailed: t('errorSend'),
        cancel: t('cancel'),
        submit: t('send'),
        submitting: t('sending'),
        close: t('close'),
        // confirmOnDirty strings — the shared confirmDialog namespace supplies
        // the chrome, `bug.confirmDiscard` the message.
        confirmDiscardTitle: tc('title'),
        confirmDiscard: t('confirmDiscard'),
        confirmDiscardConfirm: tc('confirm'),
        confirmDiscardCancel: tc('cancel'),
      }}
    />
  );
}
