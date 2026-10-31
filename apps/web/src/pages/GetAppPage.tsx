import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui';
import { APP_NAME } from '../lib/app-name';
import { isIOS, isIOSSafari, isStandalone, useInstallPrompt } from '../lib/pwa';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-7">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
      {children}
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="space-y-3 text-sm leading-relaxed text-neutral-700 [counter-reset:step]">
      {children}
    </ol>
  );
}

function Step({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 [counter-increment:step] before:flex before:h-6 before:w-6 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-neutral-950 before:text-xs before:font-semibold before:text-white before:content-[counter(step)]">
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

/** Safari's Share icon: a box with an arrow pointing up. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-label="Share"
      role="img"
      className="mx-0.5 inline h-4 w-4 -translate-y-px align-middle text-neutral-950"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" />
      <path d="M7 9H5.5A1.5 1.5 0 0 0 4 10.5v6A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 14.5 9H13" />
    </svg>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-700">
      {children}
    </div>
  );
}

const iosPushNote = (
  <Note>
    <strong className="font-medium text-neutral-950">Notifications on iPhone and iPad.</strong> Push
    notifications only work in the installed app, on iOS 16.4 or later. After adding it to your Home
    Screen, open it from there, go to Settings and turn on push notifications.
  </Note>
);

function IOSInstructions() {
  return (
    <Section title="Add to your Home Screen">
      {!isIOSSafari && (
        <p className="mb-4 text-sm text-neutral-600">
          These steps are for Safari. In other browsers, look for the Share button in the address
          bar, or open this page in Safari.
        </p>
      )}
      <Steps>
        <Step>
          Tap the Share button <ShareIcon /> in Safari's toolbar (at the bottom on iPhone, at the
          top on iPad). If you don't see it, tap the <strong className="font-medium">⋯</strong>{' '}
          button first.
        </Step>
        <Step>
          Scroll down and tap <strong className="font-medium">Add to Home Screen</strong>.
        </Step>
        <Step>
          If you see <strong className="font-medium">Open as Web App</strong>, leave it on. Then tap{' '}
          <strong className="font-medium">Add</strong>.
        </Step>
        <Step>
          Open {APP_NAME} from your Home Screen and log in. (The installed app keeps its own login,
          separate from Safari.)
        </Step>
      </Steps>
      {iosPushNote}
    </Section>
  );
}

function BrowserInstall() {
  const { canInstall, installed, install } = useInstallPrompt();

  if (installed) {
    return (
      <Section title="Installed">
        <p className="text-sm text-neutral-600">
          {APP_NAME} is installed. Open it from your Home Screen or app list.
        </p>
      </Section>
    );
  }

  if (canInstall) {
    return (
      <Section title="Install the app">
        <p className="mb-5 text-sm text-neutral-600">
          Adds {APP_NAME} to your Home Screen or app list. It opens in its own window, without the
          browser's address bar.
        </p>
        <Button onClick={() => void install()}>Install app</Button>
      </Section>
    );
  }

  // The browser didn't offer an install prompt: it doesn't support one, or the app is already
  // installed.
  return (
    <Section title="Install the app">
      <Steps>
        <Step>
          <strong className="font-medium">Android:</strong> open the browser menu{' '}
          <strong className="font-medium">⋮</strong> and tap{' '}
          <strong className="font-medium">Install app</strong> or{' '}
          <strong className="font-medium">Add to Home screen</strong>.
        </Step>
        <Step>
          <strong className="font-medium">Computer (Chrome or Edge):</strong> click the install icon
          at the right of the address bar, or find{' '}
          <strong className="font-medium">Install {APP_NAME}</strong> in the browser menu.
        </Step>
      </Steps>
      <Note>
        Don't see these options? {APP_NAME} may already be installed: look for it on your Home
        Screen or in your app list.
      </Note>
    </Section>
  );
}

function OtherDevices() {
  return (
    <Section title="On another device">
      <ul className="space-y-2 text-sm leading-relaxed text-neutral-700">
        {isIOS ? (
          <li>
            <strong className="font-medium">Android or computer:</strong> open {APP_NAME} in Chrome
            or Edge and use <strong className="font-medium">Install app</strong> on this page.
          </li>
        ) : (
          <li>
            <strong className="font-medium">iPhone or iPad:</strong> open {APP_NAME} in Safari, tap
            Share <ShareIcon /> then <strong className="font-medium">Add to Home Screen</strong>.
            Push notifications need iOS 16.4 or later and only work in the installed app.
          </li>
        )}
      </ul>
    </Section>
  );
}

export function GetAppPage() {
  if (isStandalone) {
    return (
      <div className="space-y-6">
        <PageHeader title="Get the app" subtitle="Install" />
        <Section title="You're using the app">
          <p className="text-sm text-neutral-600">
            {APP_NAME} is installed on this device. Updates arrive automatically.{' '}
            <Link to="/settings" className="font-medium text-neutral-950 hover:underline">
              Notification settings
            </Link>
          </p>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Get the app" subtitle="Install" />
      <p className="max-w-xl text-sm leading-relaxed text-neutral-600">
        Install {APP_NAME} on your phone or computer. It opens from your Home Screen like any other
        app, starts quickly, and can show reminders as notifications.
      </p>
      {isIOS ? <IOSInstructions /> : <BrowserInstall />}
      <OtherDevices />
    </div>
  );
}
