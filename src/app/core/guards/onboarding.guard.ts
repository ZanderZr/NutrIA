import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ProfileFacade } from '@core/state/profile.facade';

/** Redirects to onboarding until a profile exists. */
export const onboardingGuard: CanActivateFn = async () => {
  const profile = inject(ProfileFacade);
  const router = inject(Router);

  if (!profile.profile()) {
    await profile.load();
  }
  return profile.hasProfile() ? true : router.createUrlTree(['/onboarding']);
};

/** Inverse guard: keeps users out of onboarding once a profile exists. */
export const noProfileGuard: CanActivateFn = async () => {
  const profile = inject(ProfileFacade);
  const router = inject(Router);

  if (!profile.profile()) {
    await profile.load();
  }
  return profile.hasProfile() ? router.createUrlTree(['/tabs/chat']) : true;
};
