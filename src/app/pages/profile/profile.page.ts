import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  SsTableComponent,
  SsTableConfig,
  SsTableColumnConfig,
  SsTablePageChangeEvent,
  SsTableRowEvent,
  SsTableSearchChangeEvent,
  SsTableSelectionChangeEvent,
} from '@platform/ui-kit';
import { environment } from '../../../environments/environment';
import { KeycloakService } from '../../core/auth/keycloak.service';

interface UserInfo {
  username: string;
  fullName: string;
  position: string;
  roles: string[];
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, SsTableComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
export class ProfilePage implements OnInit {
  protected readonly keycloakService = inject(KeycloakService);
  private readonly http = inject(HttpClient);

  protected readonly isLoggedIn = signal(false);
  protected readonly userProfile = signal<UserInfo | null>(null);
  protected readonly tableData = signal<UserInfo[]>([]);
  protected readonly tableSearchTerm = signal('');
  protected readonly selectedUser = signal<UserInfo | null>(null);
  protected readonly currentPageIndex = signal(1);
  protected readonly currentPageSize = signal(5);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly tableColumns: SsTableColumnConfig<UserInfo>[] = [
    { key: 'username', header: 'Username', sortable: true, width: '180px' },
    { key: 'fullName', header: 'Full name', sortable: true, width: '240px' },
    {
      key: 'position',
      header: 'Position',
      type: 'status',
      sortable: true,
      width: '160px',
      options: [
        { label: 'USER', value: 'USER', color: 'green' },
        { label: 'Backend unavailable', value: 'Backend unavailable', color: 'red' },
      ],
    },
    { key: 'roles', header: 'Roles', type: 'array', width: '220px' },
  ];

  protected readonly filteredRows = computed(() => {
    const term = this.normalizeTerm(this.tableSearchTerm());
    const rows = this.tableData();

    if (!term) {
      return rows;
    }

    return rows.filter((row) => this.matchesSearch(row, term));
  });

  protected readonly currentRow = computed(() => this.selectedUser() ?? this.userProfile());

  protected readonly tableConfig = computed<SsTableConfig<UserInfo>>(() => ({
    bordered: true,
    size: 'middle',
    loading: this.loading(),
    pageIndex: this.currentPageIndex(),
    pageSize: this.currentPageSize(),
    lazy: false,
    selectionMode: 'single',
    showCheckbox: true,
    showIndexColumn: true,
    showSearch: true,
    showFilter: false,
    showPaginator: true,
    rowsPerPageOptions: [5, 10, 20],
    searchPlaceholder: 'Search username, name, position, or role',
    hideOnSinglePage: true,
    showQuickJumper: false,
    scrollable: false,
    tableLayout: 'fixed',
    paginationPosition: 'bottom',
    searchTerm: this.tableSearchTerm(),
    selectedRows: this.selectedUser() ? [this.selectedUser()!] : [],
    rowKey: (row) => row.username || row.fullName,
    emptyTitle: 'No matching users',
    emptyMessage: 'Try a different search term or reload the profile data.',
    sortMode: 'multiple',
  }));

  protected readonly tableSummary = computed(() => {
    const total = this.tableData().length;
    const visible = this.filteredRows().length;
    return {
      total,
      visible,
      searchActive: !!this.tableSearchTerm().trim(),
    };
  });

  protected readonly displayName = computed(() => {
    const current = this.currentRow();
    return current?.fullName || this.keycloakService.getFullName() || 'User';
  });

  protected readonly displayUsername = computed(() => {
    const current = this.currentRow();
    return current?.username || this.keycloakService.getUsername() || 'unknown';
  });

  protected readonly displayRoles = computed(() => {
    const current = this.currentRow();
    return current?.roles?.length ? current.roles.join(', ') : 'No roles';
  });

  protected readonly userInitial = computed(() => this.displayName().charAt(0).toUpperCase() || 'U');

  ngOnInit(): void {
    this.isLoggedIn.set(this.keycloakService.isLoggedIn());

    if (this.isLoggedIn()) {
      this.fetchUserProfile();
    }
  }

  fetchUserProfile(): void {
    this.loading.set(true);
    this.error.set(null);

    this.http.get<UserInfo>(`${environment.apiUrl}/users/me`).subscribe({
      next: (data) => {
        this.applyProfileData(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Cannot load user profile from backend:', err);

        const fallback: UserInfo = {
          ...this.keycloakService.getCurrentUser(),
          position: 'Backend unavailable',
          roles: [],
        };

        this.applyProfileData(fallback);
        this.error.set(
          'Cannot load position from backend. Check Spring Boot, database, and Keycloak JWT config.',
        );
        this.loading.set(false);
      },
    });
  }

  login(): void {
    this.keycloakService.login();
  }

  async logout(): Promise<void> {
    await this.keycloakService.logout();
    this.isLoggedIn.set(false);
    this.userProfile.set(null);
    this.tableData.set([]);
    this.selectedUser.set(null);
    this.tableSearchTerm.set('');
    this.error.set(null);
    this.currentPageIndex.set(1);
    this.currentPageSize.set(5);
  }

  onTableSearchChange(event: SsTableSearchChangeEvent): void {
    this.tableSearchTerm.set(event.term);
  }

  onTableSelectionChange(event: SsTableSelectionChangeEvent<UserInfo>): void {
    this.selectedUser.set(event.selectedRows[0] ?? null);
  }

  onTableRowClick(event: SsTableRowEvent<UserInfo>): void {
    this.selectedUser.set(event.row);
  }

  onTablePageChange(event: SsTablePageChangeEvent): void {
    this.currentPageIndex.set(event.pageIndex);
    this.currentPageSize.set(event.pageSize);
  }

  private applyProfileData(user: UserInfo): void {
    this.userProfile.set(user);
    this.tableData.set([user]);
    this.selectedUser.set(user);
  }

  private matchesSearch(user: UserInfo, term: string): boolean {
    const fields = [
      user.username,
      user.fullName,
      user.position,
      ...(user.roles ?? []),
    ];

    return fields.some((field) => this.normalizeTerm(field).includes(term));
  }

  private normalizeTerm(value: string | undefined | null): string {
    return (value ?? '').trim().toLowerCase();
  }
}
