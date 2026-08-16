import os
import sys
import glob
import pandas as pd

def get_csv_files():
    """
    Quét toàn bộ file .csv trong thư mục hiện hành và loại bỏ các file kết quả xuất ra.
    """
    all_csv = glob.glob("*.csv")
    # Danh sách các file kết quả cần loại trừ khỏi menu chọn
    ignored_files = {
        'epics_no_story.csv',
        'stories_no_epic.csv',
        'stories_no_subtask.csv',
        'subtasks_no_story.csv'
    }
    return [f for f in all_csv if f not in ignored_files]

def choose_file(files):
    """
    Hiển thị danh sách file có đánh số thứ tự và nhận lựa chọn từ người dùng.
    """
    print("=" * 65)
    print(" DANH SÁCH FILE CSV TRONG THƯ MỤC")
    print("=" * 65)
    for idx, filename in enumerate(files, start=1):
        file_size_kb = os.path.getsize(filename) / 1024
        print(f" [{idx}] {filename} ({file_size_kb:.1f} KB)")
    print("=" * 65)

    while True:
        choice = input(f"Nhập số thứ tự file cần phân tích (1 - {len(files)}) hoặc nhập 'q' để thoát: ").strip()
        if choice.lower() == 'q':
            print("Đã hủy thao tác.")
            sys.exit(0)
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(files):
                return files[idx - 1]
        print("Lựa chọn không hợp lệ. Vui lòng nhập lại số thứ tự!")

def ask_export_option():
    """
    Hỏi người dùng có muốn xuất các file CSV thống kê chi tiết hay không.
    Trả về True nếu đồng ý xuất file, False nếu chỉ in ra màn hình CMD.
    """
    print("\n" + "-" * 65)
    while True:
        choice = input("Bạn có muốn xuất các file CSV chi tiết không? (Y/N) [Mặc định: Y]: ").strip().lower()
        if choice in ['', 'y', 'yes', '1', 'c', 'co']:
            return True
        elif choice in ['n', 'no', '0', 'k', 'khong']:
            return False
        else:
            print("Lựa chọn không hợp lệ! Vui lòng nhập 'Y' (Có) hoặc 'N' (Không).")

def analyze_hierarchy(file_path, export_files=True):
    """
    Phân tích toàn vẹn liên kết 3 cấp Epic - Story - Subtask.
    """
    print(f"\n-> Đang đọc và phân tích file: {file_path} ...")
    try:
        df = pd.read_csv(file_path, low_memory=False)
    except Exception as e:
        print(f"Lỗi khi đọc file CSV: {e}")
        return

    df.columns = df.columns.str.strip()

    # TRƯỜNG HỢP 1: File đã gom nhóm theo cấu trúc phân cấp (có cột hierarchy_level, epic_key, story_key, subtask_key)
    if 'hierarchy_level' in df.columns:
        epics = df[df['hierarchy_level'] == 'EPIC']
        stories = df[df['hierarchy_level'] == 'STORY']
        subtasks = df[df['hierarchy_level'] == 'SUBTASK']

        defined_epics = set(epics['epic_key'].dropna().unique())
        defined_stories = set(stories['story_key'].dropna().unique())
        
        epics_in_stories = set(stories['epic_key'].dropna().unique())
        stories_in_subtasks = set(subtasks['story_key'].dropna().unique())

        # 1. Epic không có story
        epics_no_story = epics[~epics['epic_key'].isin(epics_in_stories)]
        # 2. Story không có Epic cha khai báo
        stories_no_epic = stories[~stories['epic_key'].isin(defined_epics)]
        # 3. Story không có subtask
        stories_no_subtask = stories[~stories['story_key'].isin(stories_in_subtasks)]
        # 4. Subtask không có Story cha khai báo
        subtasks_no_story = subtasks[~subtasks['story_key'].isin(defined_stories)]

        print_and_export_summary(
            total_epics=len(epics),
            total_stories=len(stories),
            total_subtasks=len(subtasks),
            epics_no_story=epics_no_story,
            stories_no_epic=stories_no_epic,
            stories_no_subtask=stories_no_subtask,
            subtasks_no_story=subtasks_no_story,
            export_files=export_files
        )
        return

    # TRƯỜNG HỢP 2: File export chuẩn Jira (Issue key, Issue Type, Epic Link, Parent)
    key_col = 'Issue key' if 'Issue key' in df.columns else 'Key' if 'Key' in df.columns else None
    type_col = 'Issue Type' if 'Issue Type' in df.columns else 'Issue type' if 'Issue type' in df.columns else None
    epic_link_col = next((c for c in df.columns if 'epic link' in c.lower()), None)
    parent_col = next((c for c in df.columns if c.lower() in ['parent', 'parent id', 'parent key', 'issue parent']), None)

    if not key_col or not type_col:
        print("Lỗi: Không tìm thấy định dạng cột hợp lệ trong file CSV.")
        return

    epics = df[df[type_col].astype(str).str.strip().str.lower() == 'epic']
    stories = df[df[type_col].astype(str).str.strip().str.lower().isin(['story', 'user story'])]
    subtasks = df[df[type_col].astype(str).str.strip().str.lower().isin(['sub-task', 'subtask'])]

    epic_keys = set(epics[key_col].dropna().astype(str).str.strip())
    story_keys = set(stories[key_col].dropna().astype(str).str.strip())

    story_parent_epic = {}
    for _, row in stories.iterrows():
        s_key = str(row[key_col]).strip()
        e_key = str(row[epic_link_col]).strip() if epic_link_col and pd.notna(row.get(epic_link_col)) else None
        if not e_key and parent_col and pd.notna(row.get(parent_col)):
            e_key = str(row[parent_col]).strip()
        story_parent_epic[s_key] = e_key

    subtask_parent_story = {}
    for _, row in subtasks.iterrows():
        sub_key = str(row[key_col]).strip()
        p_key = str(row[parent_col]).strip() if parent_col and pd.notna(row.get(parent_col)) else None
        subtask_parent_story[sub_key] = p_key

    epics_referenced_by_stories = {e for e in story_parent_epic.values() if e}
    epics_no_story = epics[~epics[key_col].isin(epics_referenced_by_stories)]

    stories_no_epic = stories[
        stories[key_col].apply(lambda k: story_parent_epic.get(k) is None or story_parent_epic.get(k) not in epic_keys)
    ]

    stories_referenced_by_subtasks = {s for s in subtask_parent_story.values() if s}
    stories_no_subtask = stories[~stories[key_col].isin(stories_referenced_by_subtasks)]

    subtasks_no_story = subtasks[
        subtasks[key_col].apply(lambda k: subtask_parent_story.get(k) is None or subtask_parent_story.get(k) not in story_keys)
    ]

    print_and_export_summary(
        total_epics=len(epics),
        total_stories=len(stories),
        total_subtasks=len(subtasks),
        epics_no_story=epics_no_story,
        stories_no_epic=stories_no_epic,
        stories_no_subtask=stories_no_subtask,
        subtasks_no_story=subtasks_no_story,
        export_files=export_files
    )

def print_and_export_summary(total_epics, total_stories, total_subtasks, epics_no_story, stories_no_epic, stories_no_subtask, subtasks_no_story, export_files=True):
    """
    In kết quả thống kê ra màn hình và tùy chọn xuất file CSV chi tiết.
    """
    print("\n" + "=" * 65)
    print(" KẾT QUẢ THỐNG KÊ TOÀN VẸN DỮ LIỆU JIRA")
    print("=" * 65)
    print(f"Tổng số Epic:      {total_epics}")
    print(f"Tổng số Story:     {total_stories}")
    print(f"Tổng số Sub-task:  {total_subtasks}")
    print("-" * 65)
    print(f"1. Số lượng Epic không có Story:             {len(epics_no_story)}")
    print(f"2. Số lượng Story không có dữ liệu Epic:     {len(stories_no_epic)}")
    print(f"3. Số lượng Story không có Sub-task:         {len(stories_no_subtask)}")
    print(f"4. Số lượng Sub-task không có dữ liệu Story: {len(subtasks_no_story)}")
    print("=" * 65)

    if export_files:
        epics_no_story.to_csv('epics_no_story.csv', index=False, encoding='utf-8-sig')
        stories_no_epic.to_csv('stories_no_epic.csv', index=False, encoding='utf-8-sig')
        stories_no_subtask.to_csv('stories_no_subtask.csv', index=False, encoding='utf-8-sig')
        subtasks_no_story.to_csv('subtasks_no_story.csv', index=False, encoding='utf-8-sig')
        print("-> Đã xuất 4 file chi tiết: epics_no_story.csv, stories_no_epic.csv, stories_no_subtask.csv, subtasks_no_story.csv.")
    else:
        print("-> Đã bỏ qua bước xuất file theo tùy chọn của bạn.")

def main():
    csv_files = get_csv_files()
    if not csv_files:
        print("Không tìm thấy file .csv nào trong thư mục hiện hành.")
        return
    
    # Bước 1: Chọn file CSV
    selected_file = choose_file(csv_files)
    
    # Bước 2: Chọn tùy chọn xuất file
    export_files = ask_export_option()
    
    # Bước 3: Thực hiện phân tích
    analyze_hierarchy(selected_file, export_files=export_files)

if __name__ == '__main__':
    main()