
        from pymol import cmd,stored
        
        set depth_cue, 1
        set fog_start, 0.4
        
        set_color b_col, [36,36,85]
        set_color t_col, [10,10,10]
        set bg_rgb_bottom, b_col
        set bg_rgb_top, t_col      
        set bg_gradient
        
        set  spec_power  =  200
        set  spec_refl   =  0
        
        load "data/protein_for_cavity_detection.pdb", protein
        create ligands, protein and organic
        select xlig, protein and organic
        delete xlig
        
        hide everything, all
        
        color white, elem c
        color bluewhite, protein
        #show_as cartoon, protein
        show surface, protein
        #set transparency, 0.15
        
        show sticks, ligands
        set stick_color, magenta
        
        
        
        
        # SAS points
 
        load "data/protein_for_cavity_detection.pdb_points.pdb.gz", points
        hide nonbonded, points
        show nb_spheres, points
        set sphere_scale, 0.2, points
        cmd.spectrum("b", "green_red", selection="points", minimum=0, maximum=0.7)
        
        
        stored.list=[]
        cmd.iterate("(resn STP)","stored.list.append(resi)")    # read info about residues STP
        lastSTP=stored.list[-1] # get the index of the last residue
        hide lines, resn STP
        
        cmd.select("rest", "resn STP and resi 0")
        
        for my_index in range(1,int(lastSTP)+1): cmd.select("pocket"+str(my_index), "resn STP and resi "+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.show("spheres","pocket"+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.set("sphere_scale","0.4","pocket"+str(my_index))
        for my_index in range(1,int(lastSTP)+1): cmd.set("sphere_transparency","0.1","pocket"+str(my_index))
        
        
        
        set_color pcol1 = [0.361,0.576,0.902]
select surf_pocket1, protein and id [311,312,369,370,371,1462,1463,1464,308,1284,194,310,307,179,1448,1449,1458,1082,1081,1091,1092,1098,1114,1120,1102,1103,1104,1281,1285,1289,1105,1109,191,1119,183,1106,186,180,309,1266,1274,1277,1439,1442,1440,1441,1446,1262] 
set surface_color,  pcol1, surf_pocket1 
set_color pcol2 = [0.416,0.278,0.702]
select surf_pocket2, protein and id [1913,1946,1550,1921,1922,1923,846,1558,1536,1874,847,1873,1870,1872,1881,1896,861,862,838,1945,2262,2263,2264,2265,2269] 
set surface_color,  pcol2, surf_pocket2 
set_color pcol3 = [0.902,0.361,0.878]
select surf_pocket3, protein and id [827,832,818,866,1158,1160,859,862,814,812,813,1157,1176,1214,1215,1159,2270,2272,2274,868,2256,1169,1174] 
set surface_color,  pcol3, surf_pocket3 
set_color pcol4 = [0.702,0.278,0.380]
select surf_pocket4, protein and id [102,751,752,225,547,227,110,111,121,735,545,546,548,549,935,936,942,949] 
set surface_color,  pcol4, surf_pocket4 
set_color pcol5 = [0.902,0.620,0.361]
select surf_pocket5, protein and id [1067,1528,2228,2229,2230,1515,1519,1015,2209] 
set surface_color,  pcol5, surf_pocket5 
   
        
        deselect
        
        orient
        