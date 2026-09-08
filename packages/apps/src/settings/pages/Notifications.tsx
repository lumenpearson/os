import { useApps, useSetting, useT } from '@lumen/kernel/react';
import { Button, SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { Send } from 'lucide-react';
import { formatTime, useNotify } from '../../_sdk';
import { setMuted } from '../logic';
import { Row } from '../Row';

export function NotificationsPage() {
  const t = useT();
  const [notifications, patch] = useSetting('notifications');
  const apps = useApps();
  const notify = useNotify();
  return (
    <SettingsPage title={t('settings.notifications')} description={t('notificationsPage.intro')}>
      <SettingsGroup title={t('notificationsPage.banners')}>
        <Row
          id="notifications.dnd"
          label={t('notificationsPage.doNotDisturb')}
          description={t('notificationsPage.doNotDisturbHint')}
        >
          <Switch
            checked={notifications.doNotDisturb}
            onChange={(e) => patch({ doNotDisturb: e.target.checked })}
          />
        </Row>
        <Row
          id="notifications.previews"
          label={t('notificationsPage.showPreviews')}
          description={t('notificationsPage.showPreviewsHint')}
        >
          <Switch
            checked={notifications.showPreviews}
            onChange={(e) => patch({ showPreviews: e.target.checked })}
          />
        </Row>
        <Row id="notifications.sound" label={t('notificationsPage.playSound')}>
          <Switch
            checked={notifications.sound}
            onChange={(e) => patch({ sound: e.target.checked })}
          />
        </Row>
        <Row id="notifications.duration" label={t('notificationsPage.duration')} stacked>
          <Slider
            aria-label={t('notificationsPage.duration')}
            min={2}
            max={15}
            step={1}
            value={Math.round(notifications.duration / 1000)}
            onChange={(s) => patch({ duration: s * 1000 })}
            showValue={(v) => `${v} s`}
          />
        </Row>
        <Row id="notifications.test" label={t('notificationsPage.test')}>
          <Button
            size="sm"
            icon={<Send className="size-3.5" />}
            onClick={() =>
              notify(
                'Test notification',
                `Sent from Settings at ${formatTime(Date.now(), { seconds: true })}.`,
              )
            }
          >
            {t('notificationsPage.send')}
          </Button>
        </Row>
      </SettingsGroup>

      <SettingsGroup
        title={t('notificationsPage.apps')}
        description={t('notificationsPage.appsHint')}
      >
        <Row id="notifications.apps" label={t('notificationsPage.allowFrom')} stacked>
          <div role="list" className="w-full divide-y divide-rule rounded-sm border border-rule">
            {apps.map((app) => {
              const Icon = app.icon;
              const allowed = !notifications.muted.includes(app.id);
              return (
                <div key={app.id} role="listitem" className="flex items-center gap-3 px-3 py-1.5">
                  <Icon size={20} />
                  <span className="truncate-1 flex-1 text-base">{app.name}</span>
                  <Switch
                    aria-label={`Allow notifications from ${app.name}`}
                    checked={allowed}
                    onChange={(e) =>
                      patch({ muted: setMuted(notifications.muted, app.id, e.target.checked) })
                    }
                  />
                </div>
              );
            })}
          </div>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
