import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { KeycloakService } from '../auth/keycloak.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.backendOrigin) || req.url.startsWith(`${environment.backendOrigin}/api/auth/`)) {
    return next(req);
  }

  const keycloakService = inject(KeycloakService);

  return from(keycloakService.getValidToken()).pipe(
    switchMap((token) => {
      if (!token) {
        return next(req);
      }

      return next(req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      }));
    })
  );
};
