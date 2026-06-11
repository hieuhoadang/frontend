import { Component } from '@angular/core';
import { ProfilePage } from './pages/profile/profile.page';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProfilePage],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
