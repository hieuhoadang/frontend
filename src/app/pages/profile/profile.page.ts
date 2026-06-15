import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { firstValueFrom } from 'rxjs';
import {
  SsTableComponent,
  SsTableColumnConfig,
  SsTableConfig,
  SsTableFilterChangeEvent,
  SsTablePageChangeEvent,
  SsTableRowEvent,
  SsTableSelectionChangeEvent,
  SsTableSearchChangeEvent,
  SsTableSortChangeEvent,
} from '@platform/ui-kit';
import { environment } from '../../../environments/environment';
import { KeycloakService } from '../../core/auth/keycloak.service';

interface UserRow {
  username: string;
  fullName: string;
  email: string;
  position: string;
  roles: string[];
}

interface UserDraft {
  username: string;
  fullName: string;
  email: string;
  position: string;
  roles: string;
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    SsTableComponent,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
export class ProfilePage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly keycloakService = inject(KeycloakService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<UserRow[]>([]);
  protected readonly total = signal(0);
  protected readonly currentUser = signal<UserRow | null>(null);
  protected readonly selectedRows = signal<UserRow[]>([]);
  protected readonly tableSearchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(5);
  protected readonly editorVisible = signal(false);
  protected readonly editorMode = signal<'create' | 'edit' | 'detail'>('detail');
  protected readonly editorLoading = signal(false);
  protected readonly editorOriginalUsername = signal('');
  protected readonly editorDraft = signal<UserDraft>({
    username: '',
    fullName: '',
    email: '',
    position: 'USER',
    roles: '',
  });

  protected readonly rowActions = [
    {
      label: 'Chi tiết',
      icon: 'eye',
      type: 'link' as const,
      onClick: (row: UserRow) => this.openDetail(row),
    },
    {
      label: 'Sửa',
      icon: 'edit',
      type: 'default' as const,
      onClick: (row: UserRow) => this.openEdit(row),
    },
    {
      label: 'Xóa',
      icon: 'delete',
      type: 'default' as const,
      onClick: (row: UserRow) => this.deleteRow(row),
      class: 'danger-action',
    },
  ];

  protected readonly tableColumns: SsTableColumnConfig<UserRow>[] = [
    { key: 'username', header: 'Username', sortable: true, width: '180px' },
    { key: 'fullName', header: 'Full name', sortable: true, width: '220px' },
    { key: 'email', header: 'Email', type: 'email', sortable: true, width: '240px' },
    {
      key: 'position',
      header: 'Position',
      type: 'status',
      sortable: true,
      width: '150px',
      options: [
        { label: 'USER', value: 'USER', color: 'green' },
        { label: 'ADMIN', value: 'ADMIN', color: 'blue' },
        { label: 'MANAGER', value: 'MANAGER', color: 'gold' },
        { label: 'DEVELOPER', value: 'DEVELOPER', color: 'purple' },
      ],
      filters: [
        { text: 'USER', value: 'USER' },
        { text: 'ADMIN', value: 'ADMIN' },
        { text: 'MANAGER', value: 'MANAGER' },
        { text: 'DEVELOPER', value: 'DEVELOPER' },
      ],
    },
    { key: 'roles', header: 'Roles', type: 'array', width: '220px' },
    {
      key: 'actions',
      header: 'Actions',
      type: 'action',
      actions: this.rowActions,
      width: '240px',
      align: 'center',
    },
  ];

  protected readonly tableConfig = computed<SsTableConfig<UserRow>>(() => ({
    bordered: true,
    size: 'middle',
    loading: this.loading(),
    loadingType: 'spinner',
    lazy: false,
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
    selectionMode: 'multiple',
    showCheckbox: true,
    showIndexColumn: true,
    showSearch: true,
    showFilter: true,
    showPaginator: true,
    rowsPerPageOptions: [5, 10, 20, 50],
    searchPlaceholder: 'Tìm theo username, tên, email, role...',
    showQuickJumper: true,
    scrollable: true,
    scrollX: 'max-content',
    scroll: { x: 'max-content' },
    tableLayout: 'fixed',
    paginationPosition: 'bottom',
    searchTerm: this.tableSearchTerm(),
    selectedRows: this.selectedRows(),
    rowKey: 'username',
    emptyTitle: 'Không có dữ liệu',
    emptyMessage: 'Thử thay đổi bộ lọc hoặc tải lại danh sách.',
    sortMode: 'multiple',
  }));

  protected readonly tableSummary = computed(() => ({
    total: this.total(),
    visible: this.rows().length,
    selected: this.selectedRows().length,
  }));

  protected readonly currentUserName = computed(
    () => this.currentUser()?.fullName || this.keycloakService.getFullName() || 'User',
  );
  protected readonly currentUserMeta = computed(
    () => this.currentUser()?.username || this.keycloakService.getUsername() || 'unknown',
  );
  protected readonly currentUserRole = computed(() =>
    this.currentUser()?.roles?.length ? this.currentUser()!.roles.join(', ') : 'No roles',
  );
  protected readonly userInitial = computed(
    () => this.currentUserName().charAt(0).toUpperCase() || 'U',
  );
  ngOnInit(): void {
    if (!this.keycloakService.isLoggedIn()) {
      this.keycloakService.login();
      return;
    }
    this.fetchUsers();
  }

  fetchUsers(): void {
    this.loading.set(true);
    this.error.set(null);

    void firstValueFrom(this.http.get<UserRow[]>(`${environment.apiUrl}/users`))
      .then((users) => {
        const rows = users ?? [];
        this.pageIndex.set(1);
        this.rows.set(rows);
        this.total.set(rows.length);
        this.selectedRows.set([]);
        this.currentUser.set(null);
        this.loading.set(false);
      })
      .catch((err) => {
        console.error('Cannot load users:', err);
        this.rows.set([]);
        this.total.set(0);
        this.selectedRows.set([]);
        this.currentUser.set(null);
        this.error.set('Không thể tải danh sách người dùng từ backend.');
        this.loading.set(false);
      });
  }

  logout(): void {
    void this.keycloakService.logout();
  }

  onTableSelectionChange(event: SsTableSelectionChangeEvent<UserRow>): void {
    this.selectedRows.set(event.selectedRows ?? []);
  }

  onTableRowClick(event: SsTableRowEvent<UserRow>): void {
    this.currentUser.set(event.row);
  }

  onTablePageChange(event: SsTablePageChangeEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onTableSortChange(event: SsTableSortChangeEvent): void {
    const active = event.activeKey
      ? { key: event.activeKey, value: event.activeOrder ?? null }
      : (event.sort.find((item) => item.value) ?? null);

    if (!active) {
      return;
    }

    this.pageIndex.set(1);
  }

  onTableFilterChange(event: SsTableFilterChangeEvent): void {
    const active = event.filters.find(
      (item) => item.key === 'position' && Array.isArray(item.value) && item.value.length > 0,
    );
    const value = active?.value?.[0];
    void value;
    this.pageIndex.set(1);
  }

  onTableSearchChange(event: SsTableSearchChangeEvent): void {
    this.tableSearchTerm.set(event.term ?? '');
    this.pageIndex.set(1);
  }

  createUser(): void {
    this.openEditor('create');
  }

  openDetail(row: UserRow): void {
    this.currentUser.set(row);
    this.editorMode.set('detail');
    this.editorOriginalUsername.set(row.username);
    this.editorDraft.set({
      username: row.username,
      fullName: row.fullName,
      email: row.email,
      position: row.position,
      roles: row.roles.join(', '),
    });
    this.editorVisible.set(true);
  }

  openEdit(row: UserRow): void {
    this.currentUser.set(row);
    this.openEditor('edit', row);
  }

  saveEditor(): void {
    const draft = this.editorDraft();
    const payload = {
      username: draft.username.trim(),
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      position: draft.position.trim(),
      roles: draft.roles
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    this.editorLoading.set(true);

    const request =
      this.editorMode() === 'edit'
        ? this.http.put(
            `${environment.apiUrl}/users/${encodeURIComponent(this.editorOriginalUsername())}`,
            payload,
          )
        : this.http.post(`${environment.apiUrl}/users`, payload);

    void firstValueFrom(request)
      .then(() => {
        this.editorLoading.set(false);
        this.editorVisible.set(false);
        this.fetchUsers();
      })
      .catch((err) => {
        console.error('Save user failed:', err);
        this.editorLoading.set(false);
        this.error.set(this.editorMode() === 'edit' ? 'Sửa user thất bại.' : 'Tạo user thất bại.');
      });
  }

  closeEditor(): void {
    this.editorVisible.set(false);
    this.editorLoading.set(false);
  }

  updateDraftField<K extends keyof UserDraft>(key: K, value: UserDraft[K]): void {
    this.editorDraft.update((draft) => ({
      ...draft,
      [key]: value,
    }));
  }

  deleteRow(row: UserRow): void {
    if (!window.confirm(`Xóa user ${row.username}?`)) {
      return;
    }

    void firstValueFrom(
      this.http.delete<void>(`${environment.apiUrl}/users/${encodeURIComponent(row.username)}`),
    )
      .then(() => this.fetchUsers())
      .catch((err) => {
        console.error('Delete user failed:', err);
        this.error.set('Xóa user thất bại.');
      });
  }

  deleteSelected(): void {
    const rows = this.selectedRows();
    if (!rows.length) {
      return;
    }

    if (!window.confirm(`Xóa ${rows.length} user đã chọn?`)) {
      return;
    }

    void Promise.all(
      rows.map((row) =>
        firstValueFrom(
          this.http.delete<void>(`${environment.apiUrl}/users/${encodeURIComponent(row.username)}`),
        ),
      ),
    )
      .then(() => {
        this.selectedRows.set([]);
        this.fetchUsers();
      })
      .catch((err) => {
        console.error('Delete selected failed:', err);
        this.error.set('Xóa các user đã chọn thất bại.');
      });
  }

  trackByUsername(_: number, row: UserRow): string {
    return row.username;
  }

  private openEditor(mode: 'create' | 'edit' | 'detail', row?: UserRow): void {
    this.editorMode.set(mode);
    this.editorOriginalUsername.set(row?.username ?? '');
    this.editorDraft.set({
      username: row?.username ?? '',
      fullName: row?.fullName ?? '',
      email: row?.email ?? '',
      position: row?.position ?? 'USER',
      roles: row?.roles?.join(', ') ?? '',
    });
    this.editorVisible.set(true);
  }
}
