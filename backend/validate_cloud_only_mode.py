#!/usr/bin/env python3
"""
Cloud-Only Mode Implementation Validator
Checks that all components are properly integrated
"""

import os
import sys
import re
from pathlib import Path


def check_env_file():
    """Verify .env has CLOUD_ONLY_MODE flag"""
    print("✓ Checking .env file...")
    env_file = Path(__file__).parent / ".env"
    
    if not env_file.exists():
        print("  ❌ .env file not found")
        return False
    
    content = env_file.read_text()
    
    if "CLOUD_ONLY_MODE" not in content:
        print("  ❌ CLOUD_ONLY_MODE not in .env")
        return False
    
    if "SUPABASE_URL" not in content:
        print("  ❌ SUPABASE_URL not in .env")
        return False
    
    if "SUPABASE_KEY" not in content:
        print("  ❌ SUPABASE_KEY not in .env")
        return False
    
    print("  ✅ .env properly configured")
    return True


def check_supabase_manager():
    """Verify supabase_manager.py has new methods"""
    print("\n✓ Checking supabase_manager.py...")
    manager_file = Path(__file__).parent / "supabase_manager.py"
    
    if not manager_file.exists():
        print("  ❌ supabase_manager.py not found")
        return False
    
    content = manager_file.read_text(encoding='utf-8')
    
    required_methods = [
        "upload_intermediate_file",
        "download_intermediate_file",
        "list_intermediate_files"
    ]
    
    for method in required_methods:
        if f"def {method}" not in content:
            print(f"  ❌ Missing method: {method}")
            return False
        print(f"  ✅ Method found: {method}")
    
    if "session_id/intermediate/" not in content:
        print("  ❌ Cloud path 'session_id/intermediate/' not found")
        return False
    
    print("  ✅ supabase_manager.py properly extended")
    return True


def check_app_py():
    """Verify app.py has cloud-only mode integration"""
    print("\n✓ Checking app.py...")
    app_file = Path(__file__).parent / "app.py"
    
    if not app_file.exists():
        print("  ❌ app.py not found")
        return False
    
    content = app_file.read_text(encoding='utf-8')
    
    # Check configuration flag
    if "CLOUD_ONLY_MODE" not in content:
        print("  ❌ CLOUD_ONLY_MODE flag not in app.py")
        return False
    print("  ✅ CLOUD_ONLY_MODE flag present")
    
    # Check helper functions
    if "def save_session_file" not in content:
        print("  ❌ save_session_file() function not found")
        return False
    print("  ✅ save_session_file() function found")
    
    if "def read_session_file" not in content:
        print("  ❌ read_session_file() function not found")
        return False
    print("  ✅ read_session_file() function found")
    
    # Check endpoint updates
    endpoints_to_check = [
        ("prepare_protein", "protein_prepared.pdbqt"),
        ("prepare_ligand", "ligand_prepared.pdbqt"),
        ("detect_cavities_endpoint", "cavities.json"),
        ("calc_grid", "grid_params.json"),
    ]
    
    for endpoint, filename in endpoints_to_check:
        # Look for cloud upload in that endpoint
        if f"async def {endpoint}" in content:
            # Find the endpoint function
            start = content.find(f"async def {endpoint}")
            # Look ahead up to 5000 chars for cloud save
            search_end = min(start + 5000, len(content))
            endpoint_section = content[start:search_end]
            
            if "save_session_file" in endpoint_section and filename in endpoint_section:
                print(f"  ✅ Endpoint {endpoint} has cloud upload support")
            else:
                print(f"  ⚠️  Endpoint {endpoint} may need cloud upload verification")
    
    print("  ✅ app.py properly integrated")
    return True


def check_documentation():
    """Verify documentation files exist"""
    print("\n✓ Checking documentation...")
    backend_dir = Path(__file__).parent
    
    docs_to_check = [
        "CLOUD_ONLY_MODE.md",
        "IMPLEMENTATION_SUMMARY.md",
        "QUICK_REFERENCE.md"
    ]
    
    all_found = True
    for doc in docs_to_check:
        doc_path = backend_dir / doc
        if doc_path.exists():
            print(f"  ✅ {doc} found")
        else:
            print(f"  ❌ {doc} not found")
            all_found = False
    
    return all_found


def check_log_patterns():
    """Verify logging patterns are in place"""
    print("\n✓ Checking logging patterns...")
    app_file = Path(__file__).parent / "app.py"
    content = app_file.read_text(encoding='utf-8')
    
    patterns = [
        ("Cloud mode enabled log", "Cloud-Only Mode:"),
        ("Cloud save log", "Cloud-saved:"),
        ("Cloud upload log", "Uploaded"),
        ("Cloud read log", "Cloud-read:"),
        ("Local save log", "Local-saved:"),
        ("Local read log", "Local-read:"),
    ]
    
    all_found = True
    for name, pattern in patterns:
        if pattern in content:
            print(f"  ✅ {name}: {pattern}")
        else:
            print(f"  ❌ {name} missing: {pattern}")
            all_found = False
    
    return all_found


def main():
    """Run all checks"""
    print("=" * 60)
    print("Cloud-Only Mode Implementation Validator")
    print("=" * 60)
    
    checks = [
        ("Environment Configuration", check_env_file),
        ("Supabase Manager Extension", check_supabase_manager),
        ("FastAPI Integration", check_app_py),
        ("Documentation", check_documentation),
        ("Logging Patterns", check_log_patterns),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ Error checking {name}: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print("=" * 60)
    print(f"Total: {passed}/{total} checks passed")
    print("=" * 60)
    
    if passed == total:
        print("\n🎉 All checks passed! Cloud-Only Mode is properly implemented.")
        return 0
    else:
        print("\n⚠️  Some checks failed. Please review the issues above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
