import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  SsTableActionColumnOptionsChangeEvent,
  SsTableComponent,
  SsTableColumnConfig,
  SsTableConfig,
  SsTableFilterChangeEvent,
  SsTablePageChangeEvent,
  SsTablePrimaryActionOptionsChangeEvent,
  SsTableRowEvent,
  SsTableSelectionChangeEvent,
  SsTableSearchChangeEvent,
  SsTableSortChangeEvent,
  SsTableSortOrder,
  SsTableToolbarActionEvent,
  SsTableVisibleColumnsChangeEvent,
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

interface UserPageResponse {
  content: UserRow[];
  total: number;
}

interface UserDraft {
  username: string;
  fullName: string;
  email: string;
  position: string;
  roles: string;
}

interface PrimaryActionFlags {
  create: boolean;
  edit: boolean;
  approve: boolean;
  import: boolean;
  export: boolean;
  delete: boolean;
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
    NzSelectModule,
    SsTableComponent,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
export class ProfilePage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly keycloakService = inject(KeycloakService);
  private lastFetchedQueryKey = '';
  private inFlightQueryKey = '';
  private latestRequestId = 0;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<UserRow[]>([]);
  protected readonly total = signal(0);
  protected readonly currentUser = signal<UserRow | null>(null);
  protected readonly selectedRows = signal<UserRow[]>([]);
  protected readonly tableSearchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly sortBy = signal('username');
  protected readonly sortOrder = signal<SsTableSortOrder>('ascend');
  protected readonly positionFilter = signal('');
  // protected readonly positionOptions = ['USER', 'ADMIN', 'MANAGER', 'DEVELOPER'];
  protected readonly activePrimaryActionKey = signal('create');
  protected readonly enabledActionColumnKeys = signal<string[]>(['detail', 'edit', 'delete']);
  protected readonly visibleColumnKeys = signal<string[]>(['username', 'fullName', 'email', 'position', 'roles']);
  protected readonly tableSearchVisible = signal(true);
  protected readonly selectionColumnVisible = signal(true);
  protected readonly indexColumnVisible = signal(true);
  protected readonly actionColumnVisible = signal(true);
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
  protected primaryActionFlags: PrimaryActionFlags = {
    create: true,
    edit: true,
    approve: true,
    import: true,
    export: true,
    delete: true,
  };

  protected readonly rowActions = [
    {
      key: 'detail',
      label: 'Chi tiết',
      icon: 'eye',
      type: 'link' as const,
      onClick: (row: UserRow) => this.openDetail(row),
    },
    {
      key: 'edit',
      label: 'Sửa',
      icon: 'edit',
      type: 'default' as const,
      onClick: (row: UserRow) => this.openEdit(row),
    },
    {
      key: 'delete',
      label: 'Xóa',
      icon: 'delete',
      type: 'default' as const,
      danger: true,
      onClick: (row: UserRow) => this.deleteRow(row),
      class: 'danger-action',
    },
    // {
    //   key: 'approve',
    //   label: 'Phê duyệt',
    //   icon: 'check',
    //   type: 'default' as const,
    //   onClick: (row: UserRow) => this.approveRow(row),
    // },
  ];
  protected readonly tableColumns = computed<SsTableColumnConfig<UserRow>[]>(() => this.buildTableColumns());
  protected readonly tableConfig = computed<SsTableConfig<UserRow>>(() => this.buildTableConfig());

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
    this.fetchUsers(true);
  }

  fetchUsers(force = false, nextPageState?: { pageIndex?: number; pageSize?: number }): void {
    const queryKey = this.buildQueryKey(nextPageState);
    if (!force && (queryKey === this.inFlightQueryKey || queryKey === this.lastFetchedQueryKey)) {
      return;
    }

    if (nextPageState?.pageIndex != null && this.pageIndex() !== nextPageState.pageIndex) {
      this.pageIndex.set(nextPageState.pageIndex);
    }
    if (nextPageState?.pageSize != null && this.pageSize() !== nextPageState.pageSize) {
      this.pageSize.set(nextPageState.pageSize);
    }

    const requestId = ++this.latestRequestId;
    this.inFlightQueryKey = queryKey;
    this.loading.set(true);
    this.error.set(null);

    void firstValueFrom(
      this.http.get<UserPageResponse>(`${environment.apiUrl}/users/page`, {
        params: this.buildQuery(nextPageState),
      }),
    )
      .then((page) => {
        if (requestId !== this.latestRequestId) {
          return;
        }
        this.lastFetchedQueryKey = queryKey;
        this.inFlightQueryKey = '';
        const rows = page.content ?? [];
        this.rows.set(rows);
        this.total.set(page.total ?? 0);
        this.selectedRows.set([]);
        this.loading.set(false);
      })
      .catch((err) => {
        if (requestId !== this.latestRequestId) {
          return;
        }
        this.inFlightQueryKey = '';
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
    this.fetchUsers(false, { pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  onTableSortChange(event: SsTableSortChangeEvent): void {
    const active = event.activeKey
      ? { key: event.activeKey, value: event.activeOrder ?? null }
      : (event.sort.find((item) => item.value) ?? null);

    if (!active) {
      return;
    }

    if (this.sortBy() === active.key && this.sortOrder() === (active.value ?? null)) {
      return;
    }

    this.sortBy.set(active.key);
    this.sortOrder.set(active.value ?? null);
    this.fetchUsers(false, { pageIndex: 1, pageSize: this.pageSize() });
  }

  onTableFilterChange(event: SsTableFilterChangeEvent): void {
    const active = event.filters.find(
      (item) => item.key === 'position' && Array.isArray(item.value) && item.value.length > 0,
    );
    const value = active?.value?.[0];
    const nextPositionFilter = value == null ? '' : String(value);
    if (this.positionFilter() === nextPositionFilter) {
      return;
    }
    this.positionFilter.set(nextPositionFilter);
    this.fetchUsers(false, { pageIndex: 1, pageSize: this.pageSize() });
  }

  onTableSearchChange(event: SsTableSearchChangeEvent): void {
    const nextSearchTerm = event.term ?? '';
    if (this.tableSearchTerm() === nextSearchTerm) {
      return;
    }
    this.tableSearchTerm.set(nextSearchTerm);
    this.fetchUsers(false, { pageIndex: 1, pageSize: this.pageSize() });
  }

  onTableToolbarAction(event: SsTableToolbarActionEvent): void {
    if (event.type === 'reload') {
      this.resetTableQueryState();
      this.fetchUsers(true, { pageIndex: 1, pageSize: this.pageSize() });
      return;
    }
    if (event.type === 'primary') {
      const activeRow = this.currentUser() ?? this.selectedRows()[0] ?? null;
      switch (this.activePrimaryActionKey()) {
        case 'edit':
          if (activeRow) {
            this.openEdit(activeRow);
          }
          break;
        case 'approve':
          if (this.currentUser()) {
            // this.approveRow(this.currentUser()!);
          }
          break;
        case 'import':
          this.error.set('Chức năng import đang chờ');
          break;
        case 'export':
          // this.exportRows();
          break;
        case 'delete':
          if (activeRow) {
            this.deleteRow(activeRow);
          }
          break;
        default:
          this.createUser();
      }
    }
  }

  onPrimaryActionOptionsChange(event: SsTablePrimaryActionOptionsChangeEvent): void {
    this.activePrimaryActionKey.set(event.activeKey ?? 'create');
  }

  onActionColumnOptionsChange(event: SsTableActionColumnOptionsChangeEvent): void {
    this.enabledActionColumnKeys.set(event.enabledKeys);
  }

  onVisibleColumnsChange(event: SsTableVisibleColumnsChangeEvent): void {
    this.visibleColumnKeys.set(event.visibleColumnKeys);
    this.tableSearchVisible.set(event.isSearchVisible);
    this.selectionColumnVisible.set(event.isSelectionColumnVisible);
    this.indexColumnVisible.set(event.isIndexColumnVisible);
    this.actionColumnVisible.set(event.isActionColumnVisible);
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
        if (this.editorMode() === 'create') {
          this.sortBy.set('username');
          this.sortOrder.set('descend');
          this.fetchUsers(true, { pageIndex: 1, pageSize: this.pageSize() });
          return;
        }
        this.fetchUsers(true, { pageIndex: this.pageIndex(), pageSize: this.pageSize() });
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
      .then(() => this.fetchUsers(true, { pageIndex: this.pageIndex(), pageSize: this.pageSize() }))
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
        this.fetchUsers(true, { pageIndex: this.pageIndex(), pageSize: this.pageSize() });
      })
      .catch((err) => {
        console.error('Delete selected failed:', err);
        this.error.set('Xóa các user đã chọn thất bại.');
      });
  }

  trackByUsername(_: number, row: UserRow): string {
    return row.username;
  }

  private buildTableColumns(): SsTableColumnConfig<UserRow>[] {
    const activeSortBy = this.sortBy();
    const activeSortOrder = this.sortOrder();
    const activePositionFilter = this.positionFilter();
    const visibleColumnKeys = new Set(this.visibleColumnKeys());

    return [
      {
        key: 'username',
        header: 'Username',
        sortable: true,
        width: '180px',
        visible: visibleColumnKeys.has('username'),
        sortOrder: activeSortBy === 'username' ? activeSortOrder : null,
      },
      {
        key: 'fullName',
        header: 'Full name',
        sortable: true,
        width: '220px',
        visible: visibleColumnKeys.has('fullName'),
        sortOrder: activeSortBy === 'fullName' ? activeSortOrder : null,
      },
      {
        key: 'email',
        header: 'Email',
        type: 'email',
        sortable: true,
        width: '240px',
        visible: visibleColumnKeys.has('email'),
        sortOrder: activeSortBy === 'email' ? activeSortOrder : null,
      },
      {
        key: 'position',
        header: 'Position',
        type: 'status',
        sortable: true,
        width: '150px',
        visible: visibleColumnKeys.has('position'),
        sortOrder: activeSortBy === 'position' ? activeSortOrder : null,
        options: [
          { label: 'USER', value: 'USER', color: 'green' },
          { label: 'ADMIN', value: 'ADMIN', color: 'blue' },
          { label: 'MANAGER', value: 'MANAGER', color: 'gold' },
          { label: 'DEVELOPER', value: 'DEVELOPER', color: 'purple' },
        ],
        filters: [
          { text: 'USER', value: 'USER', byDefault: activePositionFilter === 'USER' },
          { text: 'ADMIN', value: 'ADMIN', byDefault: activePositionFilter === 'ADMIN' },
          { text: 'MANAGER', value: 'MANAGER', byDefault: activePositionFilter === 'MANAGER' },
          { text: 'DEVELOPER', value: 'DEVELOPER', byDefault: activePositionFilter === 'DEVELOPER' },
        ],
      },
      { key: 'roles', header: 'Roles', type: 'array', width: '220px', visible: visibleColumnKeys.has('roles') },
      {
        key: 'actions',
        header: 'Actions',
        type: 'action',
        actions: this.rowActions,
        width: '40px',
        align: 'center',
      },
    ];
  }

  private buildTableConfig(): SsTableConfig<UserRow> {
    return {
      title: 'Users table',
      bordered: true,
      size: 'middle',
      loading: this.loading(),
      loadingType: 'spinner',
      lazy: true,
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      total: this.total(),
      selectionMode: 'multiple',
      showCheckbox: this.selectionColumnVisible(),
      showIndexColumn: this.indexColumnVisible(),
      showSearch: this.tableSearchVisible(),
      showFilter: true,
      showSort: true,
      showSettings: true,
      showPrimaryAction: true,
      showActionColumn: this.actionColumnVisible(),
      isActionColumnVisible: this.actionColumnVisible(),
      showPaginationQuickActions: true,
      showPaginator: true,
      enableColumnResize: true,
      rowsPerPageOptions: [5, 10, 20, 50],
      searchPlaceholder: 'Search ...',
      searchMode: 'server',
      showSearchClear: true,
      scrollable: true,
      lockBodyHeight: true,
      tableBodyHeight: '420px',
      tableLayout: 'fixed',
      defaultColumnWidth: '160px',
      selectionColumnWidth: '40px',
      indexColumnWidth: '48px',
      actionColumnWidth: '40px',
      searchTerm: this.tableSearchTerm(),
      selectedRows: this.selectedRows(),
      rowKey: 'username',
      emptyTitle: 'Không có dữ liệu',
      emptyMessage: 'Thử thay đổi bộ lọc hoặc tải lại danh sách.',
      sortMode: 'multiple',
      primaryActionOptions: this.buildPrimaryActionOptions(),
      actionColumnOptions: [
        { key: 'detail', label: 'Chi tiết', checked: this.enabledActionColumnKeys().includes('detail') },
        { key: 'edit', label: 'Sửa', checked: this.enabledActionColumnKeys().includes('edit') },
        { key: 'delete', label: 'Xóa', checked: this.enabledActionColumnKeys().includes('delete') },
      ],
    };
  }

  private buildPrimaryActionOptions() {
    const activeKey = this.activePrimaryActionKey();
    const options = [
      { key: 'create', label: 'Tạo mới', icon: 'plus', type: 'primary' as const, visible: this.primaryActionFlags.create },
      { key: 'edit', label: 'Sửa', icon: 'edit', type: 'default' as const, visible: this.primaryActionFlags.edit },
      { key: 'approve', label: 'Phê duyệt', icon: 'check', type: 'default' as const, visible: this.primaryActionFlags.approve },
      { key: 'import', label: 'Import', icon: 'upload', type: 'default' as const, visible: this.primaryActionFlags.import },
      { key: 'export', label: 'Export', icon: 'download', type: 'default' as const, visible: this.primaryActionFlags.export },
      { key: 'delete', label: 'Xóa', icon: 'delete', type: 'default' as const, danger: true, visible: this.primaryActionFlags.delete },
    ];

    return options
      .filter((option) => option.visible)
      .map(({ visible, ...option }) => ({
        ...option,
        selected: activeKey === option.key,
      }));
  }

  private buildQuery(nextPageState?: { pageIndex?: number; pageSize?: number }): HttpParams {
    const pageIndex = nextPageState?.pageIndex ?? this.pageIndex();
    const pageSize = nextPageState?.pageSize ?? this.pageSize();
    let params = new HttpParams()
      .set('search', this.tableSearchTerm())
      .set('sortBy', this.sortBy())
      .set('sortOrder', this.sortOrder() ?? '')
      .set('pageIndex', String(pageIndex))
      .set('pageSize', String(pageSize));

    if (this.positionFilter()) {
      params = params.set('position', this.positionFilter());
    }

    return params;
  }

  private buildQueryKey(nextPageState?: { pageIndex?: number; pageSize?: number }): string {
    const pageIndex = nextPageState?.pageIndex ?? this.pageIndex();
    const pageSize = nextPageState?.pageSize ?? this.pageSize();
    return [
      `search=${this.tableSearchTerm()}`,
      `sortBy=${this.sortBy()}`,
      `sortOrder=${this.sortOrder() ?? ''}`,
      `pageIndex=${pageIndex}`,
      `pageSize=${pageSize}`,
      `position=${this.positionFilter()}`,
    ].join('&');
  }

  private resetTableQueryState(): void {
    this.tableSearchTerm.set('');
    this.sortBy.set('username');
    this.sortOrder.set('ascend');
    this.positionFilter.set('');
    this.pageIndex.set(1);
    this.tableSearchVisible.set(true);
    this.selectionColumnVisible.set(true);
    this.indexColumnVisible.set(true);
    this.actionColumnVisible.set(true);
    this.visibleColumnKeys.set(['username', 'fullName', 'email', 'position', 'roles']);
    this.selectedRows.set([]);
    this.currentUser.set(null);
    this.error.set(null);
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
