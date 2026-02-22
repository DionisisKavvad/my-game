import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>Hero Wars</h1>
        <h2>Create Account</h2>

        @if (errorMessage) {
          <div class="error-banner">{{ errorMessage }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              id="username"
              type="text"
              formControlName="username"
              placeholder="Choose a username"
            />
            @if (form.get('username')?.touched && form.get('username')?.errors) {
              <span class="error">3-20 characters, letters, numbers, underscores only</span>
            }
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="Enter your email"
            />
            @if (form.get('email')?.touched && form.get('email')?.errors) {
              <span class="error">Valid email is required</span>
            }
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="Min 8 chars, upper, lower, number"
            />
            @if (form.get('password')?.touched && form.get('password')?.errors) {
              <span class="error">Min 8 characters with uppercase, lowercase, and number</span>
            }
          </div>

          <button type="submit" [disabled]="form.invalid || isLoading">
            {{ isLoading ? 'Creating account...' : 'Register' }}
          </button>
        </form>

        <p class="auth-link">
          Already have an account? <a routerLink="/login">Login</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }
    .auth-card {
      background: #0f3460;
      padding: 2rem;
      border-radius: 12px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 { text-align: center; color: #e94560; font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { text-align: center; color: #eee; margin-bottom: 1.5rem; font-weight: 400; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.25rem; color: #aaa; font-size: 0.875rem; }
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #533483;
      border-radius: 6px;
      background: #1a1a2e;
      color: #eee;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #e94560; }
    .error { color: #e94560; font-size: 0.75rem; margin-top: 0.25rem; }
    .error-banner {
      background: rgba(233, 69, 96, 0.2);
      border: 1px solid #e94560;
      color: #e94560;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      text-align: center;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 0.5rem;
    }
    button:hover:not(:disabled) { background: #c73e54; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .auth-link { text-align: center; margin-top: 1rem; color: #aaa; }
  `],
})
export class RegisterComponent {
  form: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)]],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    const { username, email, password } = this.form.value;

    this.authService.register(username, email, password).subscribe({
      next: () => {
        this.router.navigate(['/lobby']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
      },
    });
  }
}
